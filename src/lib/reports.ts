// Relatórios do dossier: relatório interno, ponto de situação para o cliente,
// relação de bens e mapa de partilha. Todos produzem DocBlocks (pré-visualização,
// impressão/PDF e Word) a partir dos dados guardados no dossier.
import { blockers, currentPhase, rankOpenTasks, taskStats } from '../engine/insights';
import { PHASES, isOpen, phaseLabel, statusLabel } from '../engine/phases';
import { calculate, type CalcResult, type HeirShare } from '../engine/succession';
import { fmtFrac, toNumber } from '../engine/fraction';
import { EVENT_KIND_LABELS } from './agenda';
import { readCalc } from './calcImport';
import { DEFAULT_SETTINGS, db, type AppSettings } from './db';
import { byCategoryThenName, clientCanProvide } from './documents';
import { tableBlock, type DocBlock, type DocRun } from './docx';
import { ACCEPTANCE_LABELS, CHANNEL_LABELS, DEBT_STATUS_LABELS, KINSHIP_LABELS, OWNERSHIP_LABELS, POA_LABELS, ROLE_LABELS, VALUE_BASIS_LABELS } from './labels';
import { longDate } from './templateContext';
import type { AssetRecord, AssetType, CaseRecord, ContactLogRecord, DebtRecord, DocumentRecord, EventRecord, MemberRecord, NoteRecord, PartyRecord, TaskRecord } from './types';
import { daysFromToday, formatDate, formatEur, todayIso } from './utils';

export type ReportKind = 'interno' | 'cliente' | 'bens' | 'partilha';

export const REPORT_KINDS: Array<{ id: ReportKind; label: string; description: string }> = [
  { id: 'interno', label: 'Relatório interno', description: 'Estado completo do dossier para a equipa: bloqueios, tarefas, interessados, património, documentos e agenda.' },
  { id: 'cliente', label: 'Ponto de situação (cliente)', description: 'Linguagem simples, sem notas internas: o que está feito, o que falta, o que precisamos e os próximos passos.' },
  { id: 'bens', label: 'Relação de bens', description: 'Verbas do ativo e do passivo com os elementos de identificação, para a participação do Imposto do Selo e para a partilha.' },
  { id: 'partilha', label: 'Mapa de partilha', description: 'Quotas de cada herdeiro, bens atribuídos e tornas a pagar ou a receber.' },
];

export const STAGE_LABELS: Record<CaseRecord['stage'], string> = { ativo: 'Ativo', suspenso: 'Suspenso', concluido: 'Concluído', arquivado: 'Arquivado' };
export const PRIORITY_LABELS: Record<CaseRecord['priority'], string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

// ---------------------------------------------------------------------------
// Blocos utilitários

const R = (text: string, bold = false): DocRun => ({ text, bold });
const h1 = (t: string): DocBlock => ({ type: 'h1', lines: [[R(t)]] });
const h2 = (t: string): DocBlock => ({ type: 'h2', lines: [[R(t)]] });
const p = (...runs: Array<string | DocRun>): DocBlock => ({ type: 'p', lines: [runs.map((r) => (typeof r === 'string' ? R(r) : r))] });
const small = (t: string): DocBlock => ({ type: 'p', small: true, lines: [[R(t)]] });
const li = (t: string): DocBlock => ({ type: 'li', lines: [[R(t)]] });
const lines = (rows: Array<Array<string | DocRun>>): DocBlock => ({ type: 'p', lines: rows.map((r) => r.map((x) => (typeof x === 'string' ? R(x) : x))) });
const dash = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : '—');
const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatEur(v));
const list = (items: string[], empty: string): DocBlock[] => (items.length ? items.map(li) : [p({ text: empty })]);

// ---------------------------------------------------------------------------
// Dados do dossier

export interface CaseBundle {
  c: CaseRecord;
  settings: AppSettings;
  members: MemberRecord[];
  parties: PartyRecord[];
  assets: AssetRecord[];
  debts: DebtRecord[];
  tasks: TaskRecord[];
  docs: DocumentRecord[];
  events: EventRecord[];
  notes: NoteRecord[];
  contacts: ContactLogRecord[];
  calc: CalcResult | null;
}

export async function loadCaseBundle(c: CaseRecord): Promise<CaseBundle> {
  const [rows, members, parties, assets, debts, tasks, docs, events, notes, contacts] = await Promise.all([
    db.settings.toArray(),
    db.members.toArray(),
    db.parties.where('caseId').equals(c.id).toArray(),
    db.assets.where('caseId').equals(c.id).toArray(),
    db.debts.where('caseId').equals(c.id).toArray(),
    db.tasks.where('caseId').equals(c.id).toArray(),
    db.documents.where('caseId').equals(c.id).toArray(),
    db.events.where('caseId').equals(c.id).toArray(),
    db.notes.where('caseId').equals(c.id).toArray(),
    db.contacts.where('caseId').equals(c.id).toArray(),
  ]);
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) (settings as unknown as Record<string, unknown>)[r.key] = r.value;
  const input = readCalc(c);
  let calc: CalcResult | null = null;
  if (input) {
    try {
      calc = calculate(input);
    } catch {
      calc = null;
    }
  }
  assets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  debts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { c, settings, members, parties, assets, debts, tasks: tasks.filter((t) => !t.obsolete).sort((a, b) => a.order - b.order), docs, events, notes, contacts, calc };
}

// ---------------------------------------------------------------------------
// Relação de bens

export const REL_GROUPS: Array<{ type: AssetType; label: string }> = [
  { type: 'imoveis', label: 'Imóveis' },
  { type: 'contas', label: 'Contas bancárias e depósitos' },
  { type: 'participacoes', label: 'Participações sociais' },
  { type: 'veiculos', label: 'Veículos' },
  { type: 'aforro', label: 'Certificados de aforro e do tesouro' },
  { type: 'outro', label: 'Outros bens e direitos' },
];

/** Quota-parte ("1/2", "50%", "1") → número entre 0 e 1. */
export function parseShare(s: string): number {
  const t = (s ?? '').trim().replace(',', '.');
  if (!t) return 1;
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (m) {
    const d = Number(m[2]);
    return d ? Math.min(1, Number(m[1]) / d) : 1;
  }
  if (t.endsWith('%')) return Math.min(1, Number(t.slice(0, -1)) / 100 || 0);
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.min(1, n > 1 ? n / 100 : n) : 1;
}

/** Valor do bem que integra a herança: quota-parte do de cujus e, nos bens comuns, só metade. */
export function estateValue(a: AssetRecord, communal: boolean): number | null {
  if (a.value === null) return null;
  return a.value * parseShare(a.share) * (communal && a.ownership === 'comum' ? 0.5 : 1);
}

export interface Verba {
  n: number;
  asset: AssetRecord;
  group: string;
  title: string;
  details: string;
}

export function describeAsset(a: AssetRecord): { title: string; details: string } {
  const foreign = a.country && a.country.trim().toLowerCase() !== 'portugal' ? ` (${a.country})` : '';
  const parts: string[] = [];
  let title = a.description.trim();
  switch (a.type) {
    case 'imoveis':
      title = title || 'Prédio';
      if (a.parish) parts.push(`freguesia de ${a.parish}`);
      if (a.matrixArticle) parts.push(`artigo matricial n.º ${a.matrixArticle}`);
      if (a.registryNumber) parts.push(`descrito na Conservatória do Registo Predial sob o n.º ${a.registryNumber}`);
      break;
    case 'contas':
      title = [a.bank, title || 'conta bancária'].filter(Boolean).join(' — ');
      if (a.iban) parts.push(`IBAN/conta ${a.iban}`);
      if (a.holder) parts.push(`titular: ${a.holder}`);
      break;
    case 'participacoes':
      title = [a.company, title].filter(Boolean).join(' — ') || 'Participação social';
      if (a.nipc) parts.push(`NIPC ${a.nipc}`);
      if (a.capitalPct) parts.push(`${a.capitalPct}% do capital`);
      break;
    case 'veiculos':
      title = title || 'Veículo';
      if (a.plate) parts.push(`matrícula ${a.plate}`);
      break;
    default:
      title = title || 'Bem';
      if (a.holder) parts.push(`entidade: ${a.holder}`);
  }
  return { title: title + foreign, details: parts.join(', ') };
}

export function verbas(assets: AssetRecord[]): Verba[] {
  const out: Verba[] = [];
  let n = 0;
  for (const g of REL_GROUPS) {
    for (const a of assets.filter((x) => x.type === g.type)) {
      n += 1;
      const d = describeAsset(a);
      out.push({ n, asset: a, group: g.label, title: d.title, details: d.details });
    }
  }
  return out;
}

export interface EstateTotals {
  communal: boolean;
  gross: number;
  meacao: number;
  liabilities: number;
  net: number;
  unvalued: number;
}

export function estateTotals(c: CaseRecord, assets: AssetRecord[], debts: DebtRecord[]): EstateTotals {
  const communal = c.answers.spouse === 'casado' && (c.answers.regime === 'comunhao_adquiridos' || c.answers.regime === 'comunhao_geral');
  let gross = 0;
  let common = 0;
  let unvalued = 0;
  for (const a of assets) {
    if (a.value === null) {
      unvalued += 1;
      continue;
    }
    const v = a.value * parseShare(a.share);
    gross += v;
    if (a.ownership === 'comum') common += v;
  }
  const meacao = communal ? common / 2 : 0;
  const liabilities = debts.filter((d) => d.status !== 'pago').reduce((s, d) => s + (d.amount ?? 0), 0);
  return { communal, gross, meacao, liabilities, net: gross - meacao - liabilities, unvalued };
}

function relacaoBensBlocks(b: CaseBundle): DocBlock[] {
  const { c, assets, debts, parties } = b;
  const head = parties.find((x) => x.isHeadOfEstate);
  const tot = estateTotals(c, assets, debts);
  const out: DocBlock[] = [];
  out.push(h1(`Relação de bens — ${c.deceased.name || c.name}`));
  out.push(
    lines([
      [R('Autor da herança: ', true), R(dash(c.deceased.name))],
      [R('NIF: ', true), R(dash(c.deceased.nif)), R('   Data do óbito: ', true), R(c.deceased.deathDate ? longDate(c.deceased.deathDate, 'pt') : '—')],
      [R('Último domicílio: ', true), R(dash(c.deceased.lastAddress))],
      [R('Cabeça-de-casal: ', true), R(head ? `${head.name}${head.kinship ? ` (${KINSHIP_LABELS[head.kinship]})` : ''}` : '—')],
      [R('Dossier: ', true), R(`${c.ref} · ${c.name}`), R('   Data: ', true), R(longDate(todayIso(), 'pt'))],
    ]),
  );
  const vs = verbas(assets);
  out.push(h2('Ativo'));
  if (!vs.length) out.push(p('(sem bens registados)'));
  for (const g of REL_GROUPS) {
    const rows = vs.filter((v) => v.group === g.label);
    if (!rows.length) continue;
    out.push(p({ text: g.label, bold: true }));
    out.push(
      tableBlock(
        ['Verba', 'Descrição', 'Natureza', 'Quota-parte', 'Valor', 'Base'],
        rows.map((v) => [
          `${v.n}`,
          v.details ? `${v.title} — ${v.details}` : v.title,
          OWNERSHIP_LABELS[v.asset.ownership],
          v.asset.share.trim() || '1/1',
          money(v.asset.value),
          v.asset.valueBasis ? VALUE_BASIS_LABELS[v.asset.valueBasis] : '—',
        ]),
        { align: ['right', 'left', 'left', 'right', 'right', 'left'], widths: [1, 6, 2.2, 1.4, 2, 2] },
      ),
    );
  }
  out.push(h2('Passivo'));
  const active = debts.filter((d) => d.status !== 'pago');
  if (!active.length) out.push(p('(sem dívidas ou encargos registados)'));
  else
    out.push(
      tableBlock(
        ['N.º', 'Credor', 'Descrição', 'Garantia', 'Estado', 'Montante'],
        active.map((d, i) => [`${i + 1}`, dash(d.creditor), dash(d.description), dash(d.guarantee), DEBT_STATUS_LABELS[d.status], money(d.amount)]),
        { align: ['right', 'left', 'left', 'left', 'left', 'right'], widths: [0.8, 3, 4, 2, 2, 2] },
      ),
    );
  out.push(h2('Resumo'));
  const rows: string[][] = [['Ativo bruto (quota-parte do de cujus)', money(tot.gross)]];
  if (tot.communal) rows.push(['Meação do cônjuge (½ dos bens comuns)', `− ${money(tot.meacao)}`]);
  rows.push(['Passivo', `− ${money(tot.liabilities)}`]);
  rows.push(['Valor da herança (estimativa)', money(tot.net)]);
  out.push(tableBlock(['Rubrica', 'Valor'], rows, { align: ['left', 'right'], widths: [5, 2] }));
  if (tot.unvalued) out.push(small(`${tot.unvalued} bem(ns) sem valor atribuído — não incluído(s) nos totais.`));
  out.push(small('Os valores seguem a base indicada em cada verba (VPT, saldo à data do óbito, valor de mercado, nominal ou estimativa). Para a participação do Imposto do Selo aplicam-se as regras de valorização do CIS (art. 13.º e seguintes). Documento de apoio, a validar pela equipa antes de qualquer entrega.'));
  return out;
}

// ---------------------------------------------------------------------------
// Mapa de partilha

export interface PartilhaState {
  /** id do bem → chave do herdeiro (HeirShare.key) ou 'venda'. */
  assignments: Record<string, string>;
  notes: string;
}

export const SALE_KEY = 'venda';

export function readPartilha(c: CaseRecord): PartilhaState {
  try {
    const raw = c.partilhaJson ? (JSON.parse(c.partilhaJson) as Partial<PartilhaState>) : {};
    return { assignments: raw.assignments ?? {}, notes: raw.notes ?? '' };
  } catch {
    return { assignments: {}, notes: '' };
  }
}

export const writePartilha = (s: PartilhaState): string => JSON.stringify(s);

export interface HeirLine {
  key: string;
  name: string;
  relation: string;
  fraction: string;
  /** Valor a que tem direito (quota × valor da herança). */
  due: number | null;
  /** Valor dos bens atribuídos (na parte que integra a herança). */
  received: number;
  /** received − due: positivo = paga tornas; negativo = recebe tornas. */
  diff: number | null;
  assets: AssetRecord[];
}

export interface PartilhaSummary {
  estate: number;
  source: 'calculo' | 'patrimonio';
  heirs: HeirLine[];
  unassigned: AssetRecord[];
  sale: AssetRecord[];
  saleValue: number;
  assignedValue: number;
}

export function partilhaSummary(calc: CalcResult | null, c: CaseRecord, assets: AssetRecord[], debts: DebtRecord[], st: PartilhaState): PartilhaSummary {
  const tot = estateTotals(c, assets, debts);
  const useCalc = Boolean(calc?.hasValues);
  const estate = useCalc && calc ? calc.values.net : tot.net;
  const shares: HeirShare[] = calc?.shares ?? [];
  const val = (a: AssetRecord) => estateValue(a, tot.communal) ?? 0;
  const heirs: HeirLine[] = shares.map((s) => {
    const mine = assets.filter((a) => st.assignments[a.id] === s.key);
    const received = mine.reduce((sum, a) => sum + val(a), 0);
    const due = estate > 0 ? estate * toNumber(s.fraction) : null;
    return { key: s.key, name: s.name, relation: s.relation, fraction: fmtFrac(s.fraction), due, received, diff: due === null ? null : received - due, assets: mine };
  });
  const keys = new Set(shares.map((s) => s.key));
  const sale = assets.filter((a) => st.assignments[a.id] === SALE_KEY);
  const unassigned = assets.filter((a) => !st.assignments[a.id] || (st.assignments[a.id] !== SALE_KEY && !keys.has(st.assignments[a.id] as string)));
  return {
    estate,
    source: useCalc ? 'calculo' : 'patrimonio',
    heirs,
    unassigned,
    sale,
    saleValue: sale.reduce((s, a) => s + val(a), 0),
    assignedValue: heirs.reduce((s, h) => s + h.received, 0),
  };
}

function mapaPartilhaBlocks(b: CaseBundle): DocBlock[] {
  const { c, assets, debts, calc } = b;
  const st = readPartilha(c);
  const sum = partilhaSummary(calc, c, assets, debts, st);
  const tot = estateTotals(c, assets, debts);
  const out: DocBlock[] = [];
  out.push(h1(`Mapa de partilha — ${c.deceased.name || c.name}`));
  out.push(lines([[R('Dossier: ', true), R(`${c.ref} · ${c.name}`), R('   Data: ', true), R(longDate(todayIso(), 'pt'))], [R('Proposta de partilha — documento de trabalho, a validar pela equipa e a acordar entre os interessados.')]]));
  out.push(h2('Valor da herança'));
  const rows: string[][] = [];
  if (sum.source === 'calculo' && calc) {
    rows.push(['Relictum (bens do de cujus)', money(calc.values.relictum)]);
    if (calc.values.meacao) rows.push(['Meação do cônjuge', `− ${money(calc.values.meacao)}`]);
    rows.push(['Valor líquido da herança', money(calc.values.net)]);
  } else {
    rows.push(['Ativo bruto (quota-parte do de cujus)', money(tot.gross)]);
    if (tot.communal) rows.push(['Meação do cônjuge (½ dos bens comuns)', `− ${money(tot.meacao)}`]);
    rows.push(['Passivo', `− ${money(tot.liabilities)}`]);
    rows.push(['Valor líquido da herança', money(tot.net)]);
  }
  out.push(tableBlock(['Rubrica', 'Valor'], rows, { align: ['left', 'right'], widths: [5, 2] }));
  out.push(h2('Quotas hereditárias'));
  if (!sum.heirs.length) out.push(p('Ainda não há cálculo de quotas guardado neste dossier (separador Quotas).'));
  else
    out.push(
      tableBlock(
        ['Herdeiro', 'Qualidade', 'Quota', 'Valor a que tem direito'],
        sum.heirs.map((h) => [h.name, h.relation, h.fraction, money(h.due)]),
        { align: ['left', 'left', 'right', 'right'], widths: [4, 3, 1.2, 2.5] },
      ),
    );
  out.push(h2('Atribuição dos bens'));
  const vs = verbas(assets);
  const who = (a: AssetRecord) => {
    const k = st.assignments[a.id];
    if (k === SALE_KEY) return 'Venda / partilha em dinheiro';
    return sum.heirs.find((h) => h.key === k)?.name ?? 'Por atribuir';
  };
  if (!vs.length) out.push(p('(sem bens registados)'));
  else
    out.push(
      tableBlock(
        ['Verba', 'Bem', 'Valor na herança', 'Atribuído a'],
        vs.map((v) => [`${v.n}`, v.title, money(estateValue(v.asset, tot.communal)), who(v.asset)]),
        { align: ['right', 'left', 'right', 'left'], widths: [1, 6, 2.5, 3.5] },
      ),
    );
  if (sum.heirs.length) {
    out.push(h2('Tornas'));
    out.push(
      tableBlock(
        ['Herdeiro', 'Direito', 'Recebe em bens', 'Diferença', 'Tornas'],
        sum.heirs.map((h) => [
          h.name,
          money(h.due),
          money(h.received),
          h.diff === null ? '—' : money(h.diff),
          h.diff === null ? '—' : Math.abs(h.diff) < 0.005 ? 'Sem tornas' : h.diff > 0 ? `Paga ${money(h.diff)}` : `Recebe ${money(-h.diff)}`,
        ]),
        { align: ['left', 'right', 'right', 'right', 'left'], widths: [3.5, 2, 2, 2, 2.5] },
      ),
    );
    if (sum.sale.length) out.push(p({ text: `Bens a vender / partilhar em dinheiro: `, bold: true }, `${sum.sale.length} verba(s), no valor de ${money(sum.saleValue)}, a distribuir pelas quotas.`));
    if (sum.unassigned.length) out.push(p({ text: 'Por atribuir: ', bold: true }, `${sum.unassigned.length} verba(s).`));
  }
  if (st.notes.trim()) {
    out.push(h2('Notas'));
    for (const l of st.notes.split('\n').filter((x) => x.trim())) out.push(p(l));
  }
  out.push(small('As tornas resultam da diferença entre o valor dos bens atribuídos e a quota de cada herdeiro. Confirmar valores, encargos e eventuais direitos de habitação ou uso antes da escritura de partilha.'));
  return out;
}

// ---------------------------------------------------------------------------
// Relatório interno

const dueText = (t: TaskRecord) => {
  if (!t.dueDate) return '—';
  const n = daysFromToday(t.dueDate);
  const rel = n === null ? '' : n < 0 ? ` (há ${-n} d)` : n === 0 ? ' (hoje)' : ` (em ${n} d)`;
  return `${formatDate(t.dueDate)}${isOpen(t.status) ? rel : ''}`;
};

function header(b: CaseBundle, title: string, subtitle: string): DocBlock[] {
  const { c, settings, members } = b;
  const responsible = members.find((m) => m.id === c.responsibleId);
  return [
    h1(title),
    lines([
      [R(settings.firmName, true), R(settings.firmCity ? ` · ${settings.firmCity}` : ''), R(settings.firmPhone ? ` · ${settings.firmPhone}` : ''), R(settings.firmEmail ? ` · ${settings.firmEmail}` : '')],
      [R(subtitle)],
      [R('Dossier: ', true), R(`${c.ref} · ${c.name}`), R('   Responsável: ', true), R(responsible?.name ?? 'Por atribuir'), R('   Data: ', true), R(longDate(todayIso(), 'pt'))],
    ]),
  ];
}

function internalBlocks(b: CaseBundle): DocBlock[] {
  const { c, parties, assets, debts, tasks, docs, events, notes, contacts, members, calc } = b;
  const stats = taskStats(tasks);
  const bl = blockers(tasks);
  const phase = currentPhase(tasks);
  const tot = estateTotals(c, assets, debts);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? '';
  const out = header(b, `Relatório do dossier — ${c.name}`, 'Relatório interno');

  out.push(h2('Identificação'));
  out.push(
    lines([
      [R('De cujus: ', true), R(dash(c.deceased.name)), R('   NIF: ', true), R(dash(c.deceased.nif))],
      [R('Óbito: ', true), R(c.deceased.deathDate ? `${longDate(c.deceased.deathDate, 'pt')}${c.deceased.deathCity ? `, ${c.deceased.deathCity}` : ''}` : '—')],
      [R('Último domicílio: ', true), R(dash(c.deceased.lastAddress))],
      [R('Cliente: ', true), R(dash(c.client.name)), R(c.client.email ? ` · ${c.client.email}` : ''), R(c.client.phone ? ` · ${c.client.phone}` : '')],
      [R('Situação: ', true), R(STAGE_LABELS[c.stage]), R('   Prioridade: ', true), R(PRIORITY_LABELS[c.priority]), R(c.tags.length ? `   Etiquetas: ${c.tags.join(', ')}` : '')],
    ]),
  );

  out.push(h2('Estado'));
  out.push(
    tableBlock(
      ['Indicador', 'Valor'],
      [
        ['Progresso', `${stats.pct}% — ${stats.done} de ${stats.applicable} tarefas concluídas`],
        ['Fase atual', phase ? phaseLabel(phase) : 'Sem trabalho em aberto'],
        ['Pendentes / Em curso / A aguardar', `${stats.byStatus.pendente} / ${stats.byStatus.em_curso} / ${stats.byStatus.aguarda}`],
        ['Prazos ultrapassados', `${bl.overdue.length}`],
        ['Tarefas críticas por iniciar', `${bl.criticalPending.length}`],
        ['A aguardar terceiros', `${bl.awaiting.length}`],
        ['Prazos nos próximos 30 dias', `${bl.dueSoon.length}`],
      ],
      { widths: [3, 5] },
    ),
  );

  out.push(h2('O que está a bloquear'));
  const blockRows: string[][] = [
    ...bl.overdue.map((t) => ['Prazo ultrapassado', t.title, dueText(t), name(t.assigneeId)]),
    ...bl.criticalPending.map((t) => ['Crítica por iniciar', t.title, dueText(t), name(t.assigneeId)]),
    ...bl.awaiting.map((t) => ['A aguardar terceiros', t.title, dueText(t), name(t.assigneeId)]),
  ];
  if (!blockRows.length) out.push(p('Nada a bloquear neste momento.'));
  else out.push(tableBlock(['Tipo', 'Tarefa', 'Prazo', 'Responsável'], blockRows, { widths: [2.2, 5.5, 2, 2] }));

  out.push(h2('Próximas ações'));
  const next = rankOpenTasks(tasks).slice(0, 8);
  out.push(...list(next.map((t) => `${t.title}${t.dueDate ? ` — ${dueText(t)}` : ''}${t.critical ? ' (crítica)' : ''}`), 'Sem ações em aberto.'));

  out.push(h2('Checklist por fase'));
  for (const ph of PHASES) {
    const rows = tasks.filter((t) => t.phase === ph.id);
    if (!rows.length) continue;
    const open = rows.filter((t) => isOpen(t.status));
    out.push(p({ text: `${ph.label} — ${rows.length - open.length} de ${rows.filter((t) => t.status !== 'na').length} concluídas`, bold: true }));
    if (open.length)
      out.push(
        tableBlock(
          ['Tarefa', 'Estado', 'Prazo', 'Responsável'],
          open.map((t) => [`${t.critical ? '★ ' : ''}${t.title}`, statusLabel(t.status), dueText(t), name(t.assigneeId) || '—']),
          { widths: [6, 2, 2, 2] },
        ),
      );
  }

  out.push(h2('Interessados'));
  if (!parties.length) out.push(p('(sem interessados registados)'));
  else
    out.push(
      tableBlock(
        ['Nome', 'Qualidade', 'Parentesco', 'Procuração', 'Aceitação'],
        parties.map((x) => [
          `${x.name}${x.isHeadOfEstate ? ' (cabeça-de-casal)' : ''}${x.isMinor ? ' (menor)' : ''}`,
          x.roles.map((r) => ROLE_LABELS[r]).join(', ') || '—',
          x.kinship ? KINSHIP_LABELS[x.kinship] : '—',
          POA_LABELS[x.poa],
          ACCEPTANCE_LABELS[x.acceptance],
        ]),
        { widths: [4, 3, 2.2, 1.8, 2.5] },
      ),
    );

  out.push(h2('Património e passivo'));
  const vs = verbas(assets);
  if (!vs.length) out.push(p('(sem bens registados)'));
  else
    out.push(
      tableBlock(
        ['Verba', 'Bem', 'Natureza', 'Estado', 'Valor'],
        vs.map((v) => [`${v.n}`, v.title, OWNERSHIP_LABELS[v.asset.ownership], v.asset.status, money(v.asset.value)]),
        { align: ['right', 'left', 'left', 'left', 'right'], widths: [1, 6, 2.5, 2, 2] },
      ),
    );
  const active = debts.filter((d) => d.status !== 'pago');
  if (active.length) out.push(tableBlock(['Credor', 'Descrição', 'Estado', 'Montante'], active.map((d) => [dash(d.creditor), dash(d.description), DEBT_STATUS_LABELS[d.status], money(d.amount)]), { align: ['left', 'left', 'left', 'right'], widths: [3, 5, 2, 2] }));
  const totals: string[][] = [['Ativo bruto', money(tot.gross)]];
  if (tot.communal) totals.push(['Meação do cônjuge', `− ${money(tot.meacao)}`]);
  totals.push(['Passivo', `− ${money(tot.liabilities)}`], ['Valor líquido (estimativa)', money(tot.net)]);
  out.push(tableBlock(['Rubrica', 'Valor'], totals, { align: ['left', 'right'], widths: [5, 2] }));

  if (calc?.shares.length) {
    out.push(h2('Quotas hereditárias (simulação guardada)'));
    out.push(
      tableBlock(
        ['Herdeiro', 'Qualidade', 'Quota', 'Valor estimado'],
        calc.shares.map((s) => [s.name, s.relation, fmtFrac(s.fraction), money(s.amount)]),
        { align: ['left', 'left', 'right', 'right'], widths: [4, 3, 1.2, 2.5] },
      ),
    );
    if (calc.warnings.length) out.push(...calc.warnings.map((w) => small(`Aviso: ${w}`)));
  }

  out.push(h2('Documentos'));
  const missing = docs.filter((d) => d.status === 'em_falta' || d.status === 'pedido').sort(byCategoryThenName);
  const okDocs = docs.filter((d) => d.status === 'recebido' || d.status === 'validado').length;
  out.push(p(`${okDocs} recebido(s)/validado(s) · ${missing.length} em falta ou pedido(s).`));
  out.push(...list(missing.map((d) => `${d.name}${d.status === 'pedido' ? ' — pedido' : ''}${d.notes ? ` (${d.notes})` : ''}`), 'Sem documentos em falta.'));

  out.push(h2('Agenda'));
  const today = todayIso();
  const upcoming = events.filter((e) => !e.done && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  out.push(...list(upcoming.map((e) => `${formatDate(e.date)}${e.time ? ` ${e.time}` : ''} — ${e.title || EVENT_KIND_LABELS[e.kind]}${e.location ? ` (${e.location})` : ''}`), 'Sem eventos agendados.'));

  const pinned = notes.filter((n) => n.pinned);
  if (pinned.length) {
    out.push(h2('Notas importantes'));
    out.push(...pinned.map((n) => li(n.text)));
  }
  if (c.generalNotes.trim()) {
    out.push(h2('Observações do dossier'));
    for (const l of c.generalNotes.split('\n').filter((x) => x.trim())) out.push(p(l));
  }
  const recent = [...contacts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (recent.length) {
    out.push(h2('Últimos contactos'));
    out.push(
      tableBlock(
        ['Data', 'Pessoa', 'Canal', 'Resumo', 'Seguimento'],
        recent.map((k) => [formatDate(k.date), `${k.person}${k.role ? ` (${ROLE_LABELS[k.role]})` : ''}`, CHANNEL_LABELS[k.channel], k.summary, k.followUp ? `${formatDate(k.followUp)}${k.followUpDone ? ' ✓' : ''}` : '—']),
        { widths: [1.6, 3, 1.6, 5, 1.8] },
      ),
    );
  }
  out.push(small('Relatório interno gerado pelo Balcão das Sucessões. Conteúdo de apoio — prazos e referências a validar pela equipa.'));
  return out;
}

// ---------------------------------------------------------------------------
// Ponto de situação para o cliente

function clientBlocks(b: CaseBundle): DocBlock[] {
  const { c, tasks, docs, events, settings, members } = b;
  const stats = taskStats(tasks);
  const phase = currentPhase(tasks);
  const responsible = members.find((m) => m.id === c.responsibleId);
  const out = header(b, `Ponto de situação — ${c.deceased.name ? `sucessão de ${c.deceased.name}` : c.name}`, `Para: ${c.client.name || 'cliente'}`);

  out.push(p(`${c.client.name ? `Exmo.(a) Senhor(a) ${c.client.name}, ` : ''}apresentamos o ponto de situação do processo sucessório à data de ${longDate(todayIso(), 'pt')}.`));
  out.push(h2('Onde estamos'));
  out.push(p(`Estão concluídos ${stats.done} de ${stats.applicable} passos (${stats.pct}%).`, phase ? ` O processo encontra-se na fase de ${phaseLabel(phase).toLowerCase()}.` : ' Não há passos em aberto.'));

  const done = tasks.filter((t) => t.status === 'concluido');
  out.push(h2('O que já está feito'));
  out.push(...list(done.slice(-10).map((t) => t.title), 'Ainda sem passos concluídos.'));

  const working = tasks.filter((t) => t.status === 'em_curso' || t.status === 'aguarda');
  out.push(h2('O que estamos a tratar'));
  out.push(...list(working.map((t) => `${t.title}${t.status === 'aguarda' ? ' — a aguardar resposta de terceiros' : ''}`), 'Nada em curso neste momento.'));

  const needed = docs.filter((d) => (d.status === 'em_falta' || d.status === 'pedido') && clientCanProvide(d)).sort(byCategoryThenName);
  out.push(h2('O que precisamos de si'));
  out.push(...list(needed.map((d) => d.name), 'Neste momento não precisamos de mais documentos da sua parte.'));

  out.push(h2('Próximos passos e prazos'));
  const today = todayIso();
  const upcomingTasks = tasks.filter((t) => isOpen(t.status) && t.dueDate && t.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const upcomingEvents = events.filter((e) => !e.done && e.date >= today && (e.kind === 'escritura' || e.kind === 'reuniao')).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const steps = [
    ...upcomingEvents.map((e) => `${longDate(e.date, 'pt')}${e.time ? `, ${e.time}` : ''} — ${e.title || EVENT_KIND_LABELS[e.kind]}${e.location ? `, ${e.location}` : ''}`),
    ...upcomingTasks.map((t) => `Até ${longDate(t.dueDate, 'pt')} — ${t.title}`),
  ];
  out.push(...list(steps, 'Sem prazos próximos.'));

  out.push(h2('Contactos'));
  out.push(
    lines([
      [R(settings.firmName, true), R(responsible ? ` — ${responsible.name}` : '')],
      [R([settings.firmEmail, settings.firmPhone].filter(Boolean).join(' · ') || ' ')],
      [R(settings.firmAddress || ' ')],
    ]),
  );
  out.push(small('Este ponto de situação reflete a informação disponível à data indicada. Os prazos referidos podem depender de terceiros (repartições, bancos, notários) e serão confirmados pela equipa.'));
  return out;
}

// ---------------------------------------------------------------------------

export interface BuiltReport {
  kind: ReportKind;
  title: string;
  blocks: DocBlock[];
  /** Nome-base para ficheiros (sem extensão). */
  fileBase: string;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 50);

export function buildReport(kind: ReportKind, b: CaseBundle): BuiltReport {
  const blocks = kind === 'interno' ? internalBlocks(b) : kind === 'cliente' ? clientBlocks(b) : kind === 'bens' ? relacaoBensBlocks(b) : mapaPartilhaBlocks(b);
  const title = blocks[0]?.lines[0]?.map((r) => r.text).join('') ?? REPORT_KINDS.find((k) => k.id === kind)!.label;
  const label = REPORT_KINDS.find((k) => k.id === kind)!.label;
  return { kind, title, blocks, fileBase: `${slug(label)}-${slug(b.c.ref)}-${todayIso()}` };
}

// ---------------------------------------------------------------------------
// Linhas para CSV

export function assetsCsvRows(c: CaseRecord, assets: AssetRecord[], debts: DebtRecord[]): { header: string[]; rows: Array<Array<string | number | null>> } {
  const tot = estateTotals(c, assets, debts);
  const header = ['Verba', 'Grupo', 'Bem', 'Detalhes', 'País', 'Natureza', 'Quota-parte', 'Valor', 'Base do valor', 'Valor na herança', 'Estado', 'Observações'];
  const rows: Array<Array<string | number | null>> = verbas(assets).map((v) => [
    v.n,
    v.group,
    v.title,
    v.details,
    v.asset.country,
    OWNERSHIP_LABELS[v.asset.ownership],
    v.asset.share || '1/1',
    v.asset.value,
    v.asset.valueBasis ? VALUE_BASIS_LABELS[v.asset.valueBasis] : '',
    estateValue(v.asset, tot.communal),
    v.asset.status,
    v.asset.notes,
  ]);
  for (const d of debts) rows.push(['', 'Passivo', d.creditor, d.description, '', '', '', d.amount === null ? null : -d.amount, '', d.status === 'pago' ? 0 : d.amount === null ? null : -d.amount, DEBT_STATUS_LABELS[d.status], d.notes]);
  return { header, rows };
}
