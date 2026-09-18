// Honorários e despesas por dossier: registo de tempo (com cronómetro), despesas, provisões
// recebidas e cálculo da nota de honorários (IVA, retenção na fonte, saldo). É um documento de
// apoio: a fatura tem de ser emitida num programa de faturação certificado pela AT.
import { db, getSetting, logActivity, newExpense, newProvision, newTimeEntry, setSetting, touchCase, type AppSettings } from './db';
import { restoreTrash, trashRecord } from './recycle';
import type { ActiveTimer, CaseRecord, ExpenseCategory, ExpenseRecord, FeesConfig, MemberRecord, ProvisionRecord, TimeEntryRecord } from './types';
import { pushUndo } from './undo';
import { formatDate, formatEur, nowIso, todayIso } from './utils';

export const EXPENSE_CATEGORIES: Array<{ id: ExpenseCategory; label: string }> = [
  { id: 'emolumentos', label: 'Emolumentos (registos e notariado)' },
  { id: 'impostos', label: 'Impostos e taxas' },
  { id: 'custas', label: 'Custas judiciais' },
  { id: 'certidoes', label: 'Certidões' },
  { id: 'traducoes', label: 'Traduções e apostilas' },
  { id: 'deslocacoes', label: 'Deslocações' },
  { id: 'correio', label: 'Correio e comunicações' },
  { id: 'outros', label: 'Outras' },
];

export const categoryLabel = (c: ExpenseCategory): string => EXPENSE_CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const DEFAULT_FEES: FeesConfig = { mode: 'horas', fixedFee: null, rate: null, withholding: false, notes: '' };

/** Acordo de honorários do dossier (valores por omissão quando não existe ou está danificado). */
export function readFees(c: Pick<CaseRecord, 'feesJson'>): FeesConfig {
  if (!c.feesJson) return { ...DEFAULT_FEES };
  try {
    const v = JSON.parse(c.feesJson) as Partial<FeesConfig>;
    return {
      mode: v.mode === 'fixo' ? 'fixo' : 'horas',
      fixedFee: typeof v.fixedFee === 'number' && Number.isFinite(v.fixedFee) ? v.fixedFee : null,
      rate: typeof v.rate === 'number' && Number.isFinite(v.rate) ? v.rate : null,
      withholding: v.withholding === true,
      notes: typeof v.notes === 'string' ? v.notes : '',
    };
  } catch {
    return { ...DEFAULT_FEES };
  }
}

export async function saveFees(caseId: string, cfg: FeesConfig): Promise<void> {
  await db.cases.update(caseId, { feesJson: JSON.stringify(cfg), updatedAt: nowIso() });
  await logActivity(caseId, 'honorarios', `Acordo de honorários: ${cfg.mode === 'fixo' ? `valor fixo de ${cfg.fixedFee === null ? '(por indicar)' : formatEur(cfg.fixedFee)}` : `por hora${cfg.rate ? ` (${formatEur(cfg.rate)}/h)` : ''}`}${cfg.withholding ? ', com retenção na fonte' : ''}`);
}

// ---------------------------------------------------------------------------
// Tempo

/** Lê uma duração escrita à mão: «1:30», «1h30», «2h», «45m», «90 min», «1,5» (horas). Devolve minutos. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let m: RegExpExecArray | null;
  let min: number | null = null;
  if ((m = /^(\d{1,3}):([0-5]?\d)$/.exec(s))) min = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d{1,3})h(?:([0-5]?\d)(?:m|min)?)?$/.exec(s))) min = Number(m[1]) * 60 + Number(m[2] ?? 0);
  else if ((m = /^(\d{1,4})(?:m|min|mins|minutos?)$/.exec(s))) min = Number(m[1]);
  else if ((m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(s))) min = Math.round(parseFloat(`${m[1]}.${m[2] ?? '0'}`) * 60);
  return min !== null && min > 0 && min <= 24 * 60 ? min : null;
}

/** 90 → «1:30». */
export const formatDuration = (min: number): string => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** Arredonda para cima ao bloco de faturação (6 min = décimas de hora). */
export const roundUp = (min: number, block: number): number => (block > 0 ? Math.ceil(min / block) * block : min);

const cents = (v: number) => Math.round(v * 100) / 100;

/** Taxa aplicável a um registo: a da entrada, a do dossier, a da pessoa ou a do escritório. */
export function resolveRate(e: Pick<TimeEntryRecord, 'rate' | 'memberId'>, cfg: FeesConfig, members: Map<string, MemberRecord>, fallback: number): number {
  if (e.rate !== null && e.rate !== undefined && e.rate >= 0) return e.rate;
  if (cfg.rate !== null && cfg.rate >= 0) return cfg.rate;
  const m = members.get(e.memberId);
  if (m?.hourlyRate !== null && m?.hourlyRate !== undefined && m.hourlyRate >= 0) return m.hourlyRate;
  return fallback;
}

export interface FeeLine {
  entry: TimeEntryRecord;
  billedMinutes: number;
  rate: number;
  amount: number;
}

export type FeeSettings = Pick<AppSettings, 'hourlyRate' | 'vatRate' | 'timeRounding' | 'withholdingRate'>;

export interface FeeSummary {
  mode: FeesConfig['mode'];
  /** Todo o tempo registado. */
  minutes: number;
  /** Tempo faturável (antes do arredondamento). */
  billableMinutes: number;
  /** Tempo faturável arredondado ao bloco. */
  billedMinutes: number;
  /** Valor do tempo faturável (mesmo com honorários fixos, para comparação). */
  timeValue: number;
  /** Honorários (sem IVA). */
  feesNet: number;
  vatRate: number;
  vat: number;
  withholdingRate: number;
  withholding: number;
  expensesTotal: number;
  expensesBillable: number;
  provisions: number;
  /** Positivo: a pagar pelo cliente; negativo: saldo a favor do cliente. */
  due: number;
  /** Valor por hora efetivamente obtido (honorários ÷ tempo registado). */
  effectiveRate: number | null;
  lines: FeeLine[];
  byMember: Array<{ memberId: string; name: string; minutes: number; amount: number }>;
  byCategory: Array<{ category: ExpenseCategory; label: string; amount: number }>;
}

export function feeSummary(input: { entries: TimeEntryRecord[]; expenses: ExpenseRecord[]; provisions: ProvisionRecord[]; cfg: FeesConfig; members: MemberRecord[]; settings: FeeSettings }): FeeSummary {
  const { cfg, settings } = input;
  const members = new Map(input.members.map((m) => [m.id, m]));
  const entries = [...input.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const lines: FeeLine[] = entries
    .filter((e) => e.billable && e.minutes > 0)
    .map((e) => {
      const billedMinutes = roundUp(e.minutes, settings.timeRounding);
      const rate = resolveRate(e, cfg, members, settings.hourlyRate);
      return { entry: e, billedMinutes, rate, amount: cents((billedMinutes / 60) * rate) };
    });
  const minutes = entries.reduce((s, e) => s + Math.max(0, e.minutes), 0);
  const timeValue = cents(lines.reduce((s, l) => s + l.amount, 0));
  const feesNet = cfg.mode === 'fixo' ? cents(cfg.fixedFee ?? 0) : timeValue;
  const vat = cents((feesNet * settings.vatRate) / 100);
  const withholding = cfg.withholding ? cents((feesNet * settings.withholdingRate) / 100) : 0;
  const expensesTotal = cents(input.expenses.reduce((s, x) => s + x.amount, 0));
  const expensesBillable = cents(input.expenses.filter((x) => x.billable).reduce((s, x) => s + x.amount, 0));
  const provisions = cents(input.provisions.reduce((s, x) => s + x.amount, 0));
  const byMemberMap = new Map<string, { minutes: number; amount: number }>();
  for (const e of entries) {
    const cur = byMemberMap.get(e.memberId) ?? { minutes: 0, amount: 0 };
    cur.minutes += e.minutes;
    byMemberMap.set(e.memberId, cur);
  }
  for (const l of lines) byMemberMap.get(l.entry.memberId)!.amount = cents(byMemberMap.get(l.entry.memberId)!.amount + l.amount);
  const byCategoryMap = new Map<ExpenseCategory, number>();
  for (const x of input.expenses) byCategoryMap.set(x.category, cents((byCategoryMap.get(x.category) ?? 0) + x.amount));
  return {
    mode: cfg.mode,
    minutes,
    billableMinutes: entries.filter((e) => e.billable).reduce((s, e) => s + Math.max(0, e.minutes), 0),
    billedMinutes: lines.reduce((s, l) => s + l.billedMinutes, 0),
    timeValue,
    feesNet,
    vatRate: settings.vatRate,
    vat,
    withholdingRate: settings.withholdingRate,
    withholding,
    expensesTotal,
    expensesBillable,
    provisions,
    due: cents(feesNet + vat - withholding + expensesBillable - provisions),
    effectiveRate: minutes > 0 ? cents(feesNet / (minutes / 60)) : null,
    lines,
    byMember: [...byMemberMap.entries()]
      .map(([memberId, v]) => ({ memberId, name: members.get(memberId)?.name ?? (memberId ? 'Pessoa removida' : 'Sem pessoa'), minutes: v.minutes, amount: v.amount }))
      .sort((a, b) => b.minutes - a.minutes),
    byCategory: [...byCategoryMap.entries()].map(([category, amount]) => ({ category, label: categoryLabel(category), amount })).sort((a, b) => b.amount - a.amount),
  };
}

// ---------------------------------------------------------------------------
// Escrita (com histórico, reciclagem e «anular»)

export async function addTimeEntry(caseId: string, data: Partial<TimeEntryRecord>): Promise<TimeEntryRecord> {
  const e = newTimeEntry(caseId, data);
  if (!(e.minutes > 0)) throw new Error('Indique a duração (por exemplo 1:30 ou 45m).');
  await db.timeEntries.add(e);
  await touchCase(caseId);
  await logActivity(caseId, 'honorarios', `Tempo registado: ${formatDuration(e.minutes)}${e.description ? ` — ${e.description}` : ''}`);
  return e;
}

export async function updateTimeEntry(e: TimeEntryRecord, patch: Partial<TimeEntryRecord>): Promise<void> {
  await db.timeEntries.update(e.id, { ...patch, updatedAt: nowIso() });
  await touchCase(e.caseId);
}

export async function deleteTimeEntry(e: TimeEntryRecord): Promise<void> {
  const label = `${formatDuration(e.minutes)} em ${formatDate(e.date)}${e.description ? ` — ${e.description}` : ''}`;
  const entry = await trashRecord('timeEntries', e, label);
  await logActivity(e.caseId, 'honorarios', `Registo de tempo removido (na reciclagem): ${label}`);
  pushUndo(`Registo de tempo removido: ${formatDuration(e.minutes)}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

export async function addExpense(caseId: string, data: Partial<ExpenseRecord>): Promise<ExpenseRecord> {
  const x = newExpense(caseId, data);
  if (!(x.amount > 0)) throw new Error('Indique o valor da despesa.');
  await db.expenses.add(x);
  await touchCase(caseId);
  await logActivity(caseId, 'honorarios', `Despesa registada: ${formatEur(x.amount)} — ${x.description || categoryLabel(x.category)}${x.billable ? '' : ' (não debitada ao cliente)'}`);
  return x;
}

export async function updateExpense(x: ExpenseRecord, patch: Partial<ExpenseRecord>): Promise<void> {
  await db.expenses.update(x.id, { ...patch, updatedAt: nowIso() });
  await touchCase(x.caseId);
}

export async function deleteExpense(x: ExpenseRecord): Promise<void> {
  const label = `${formatEur(x.amount)} — ${x.description || categoryLabel(x.category)}`;
  const entry = await trashRecord('expenses', x, label);
  await logActivity(x.caseId, 'honorarios', `Despesa removida (na reciclagem): ${label}`);
  pushUndo(`Despesa removida: ${formatEur(x.amount)}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

export async function addProvision(caseId: string, data: Partial<ProvisionRecord>): Promise<ProvisionRecord> {
  const pv = newProvision(caseId, data);
  if (!(pv.amount > 0)) throw new Error('Indique o valor recebido.');
  await db.provisions.add(pv);
  await touchCase(caseId);
  await logActivity(caseId, 'honorarios', `Provisão recebida: ${formatEur(pv.amount)}${pv.description ? ` — ${pv.description}` : ''}`);
  return pv;
}

export async function deleteProvision(pv: ProvisionRecord): Promise<void> {
  const label = `${formatEur(pv.amount)} em ${formatDate(pv.date)}`;
  const entry = await trashRecord('provisions', pv, label);
  await logActivity(pv.caseId, 'honorarios', `Provisão removida (na reciclagem): ${label}`);
  pushUndo(`Provisão removida: ${formatEur(pv.amount)}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

// ---------------------------------------------------------------------------
// Cronómetro (um de cada vez, neste dispositivo)

export const elapsedMinutes = (t: Pick<ActiveTimer, 'startedAt'>, now: Date = new Date()): number => Math.max(1, Math.ceil((now.getTime() - new Date(t.startedAt).getTime()) / 60_000));

/** Inicia o cronómetro num dossier; se outro estiver a correr, regista-o primeiro. */
export async function startTimer(caseId: string, description = '', memberId = '', now: Date = new Date()): Promise<{ timer: ActiveTimer; stopped: TimeEntryRecord | null }> {
  const stopped = (await getSetting('activeTimer')) ? await stopTimer(now) : null;
  const timer: ActiveTimer = { caseId, startedAt: now.toISOString(), description: description.trim(), memberId: memberId || (await getSetting('meId')) };
  await setSetting('activeTimer', timer);
  return { timer, stopped };
}

/** Para o cronómetro e cria o registo de tempo (arredondado ao minuto, mínimo 1). */
export async function stopTimer(now: Date = new Date()): Promise<TimeEntryRecord | null> {
  const t = await getSetting('activeTimer');
  if (!t) return null;
  await setSetting('activeTimer', null);
  if (!(await db.cases.get(t.caseId))) return null;
  return addTimeEntry(t.caseId, { date: todayIso(new Date(t.startedAt)), minutes: elapsedMinutes(t, now), memberId: t.memberId, description: t.description || 'Trabalho no dossier (cronómetro)' });
}

export async function discardTimer(): Promise<void> {
  await setSetting('activeTimer', null);
}

// ---------------------------------------------------------------------------
// Exportação

export function feesCsv(s: FeeSummary, expenses: ExpenseRecord[], provisions: ProvisionRecord[], members: MemberRecord[]): { header: string[]; rows: Array<Array<string | number | null>> } {
  const name = new Map(members.map((m) => [m.id, m.name]));
  const header = ['Tipo', 'Data', 'Descrição', 'Pessoa/Categoria', 'Tempo (h:mm)', 'Tempo faturado (h)', 'Taxa (€/h)', 'Valor (€)'];
  const rows: Array<Array<string | number | null>> = [];
  for (const l of s.lines) {
    const e = l.entry;
    rows.push(['Tempo', e.date, e.description, name.get(e.memberId) ?? '', formatDuration(e.minutes), Math.round((l.billedMinutes / 60) * 100) / 100, l.rate, l.amount]);
  }
  for (const x of expenses) rows.push([x.billable ? 'Despesa (a debitar)' : 'Despesa (interna)', x.date, x.description, categoryLabel(x.category), '', null, null, x.amount]);
  for (const p of provisions) rows.push(['Provisão recebida', p.date, p.description, '', '', null, null, -p.amount]);
  rows.push(['Total a pagar', '', s.mode === 'fixo' ? 'Honorários fixos' : 'Honorários por hora', '', formatDuration(s.minutes), Math.round((s.billedMinutes / 60) * 100) / 100, null, s.due]);
  return { header, rows };
}
