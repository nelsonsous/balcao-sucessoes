// Análise da equipa: agregações puras (testáveis) sobre dossiers, tarefas e membros —
// por mês, por fase e por pessoa. Gestão interna do escritório; não substitui a
// contabilidade nem os registos oficiais.
import { PHASES, isOpen } from '../engine/phases';
import type { CaseRecord, MemberRecord, PhaseId, TaskRecord } from './types';
import { todayIso } from './utils';

/** Meses a analisar (0 = tudo). */
export type Period = 3 | 6 | 12 | 0;

export const PERIOD_LABELS: Record<Period, string> = { 3: '3 meses', 6: '6 meses', 12: '12 meses', 0: 'Tudo' };

export interface AnalyticsInput {
  cases: CaseRecord[];
  tasks: TaskRecord[];
  members: MemberRecord[];
  period?: Period;
  /** Restringe aos dossiers/tarefas desta pessoa (responsável ou atribuída). */
  memberId?: string;
  now?: Date;
}

export interface MonthPoint {
  /** AAAA-MM */
  key: string;
  label: string;
  opened: number;
  closed: number;
  tasksDone: number;
  onTime: number;
  late: number;
}

export interface PhaseStat {
  id: PhaseId;
  label: string;
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** Dossiers em que a fase está concluída (todas as tarefas aplicáveis). */
  casesCompleted: number;
  /** Dias desde a abertura do dossier até a fase ficar concluída. */
  medianDays: number | null;
  meanDays: number | null;
}

export interface MemberStat {
  id: string;
  name: string;
  color: string;
  activeCases: number;
  openTasks: number;
  overdue: number;
  /** Tarefas concluídas nos últimos 30 dias. */
  doneRecent: number;
  /** Concluídas dentro do prazo / concluídas com prazo, no período (0–1). */
  onTimeRate: number | null;
  /** Dias, em média, entre a criação e a conclusão das tarefas concluídas no período. */
  meanCompletionDays: number | null;
}

export interface Analytics {
  since: string;
  months: MonthPoint[];
  phases: PhaseStat[];
  members: MemberStat[];
  kpis: {
    activeCases: number;
    closedCases: number;
    openTasks: number;
    overdueOpen: number;
    tasksDone: number;
    onTimeRate: number | null;
    meanCloseDays: number | null;
  };
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY = 86_400_000;

export const monthKey = (iso: string): string => iso.slice(0, 7);

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS_PT[Number(m) - 1] ?? m} ${y}`;
}

/** Chaves AAAA-MM de `since` (inclusive) até `now` (inclusive). */
export function monthRange(since: string, now: Date): string[] {
  const out: string[] = [];
  let [y, m] = since.split('-').map(Number) as [number, number];
  const end = monthKey(todayIso(now));
  for (let i = 0; i < 240; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const isClosed = (c: CaseRecord) => c.stage === 'concluido' || c.stage === 'arquivado';
const isActive = (c: CaseRecord) => c.stage === 'ativo' || c.stage === 'suspenso';

const mean = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}
const days = (fromIso: string, toIso: string): number => Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY);
const rate = (ok: number, total: number): number | null => (total ? Math.round((ok / total) * 1000) / 1000 : null);

/** Conclusão dentro do prazo: a data de conclusão não passa a data do prazo. */
export const isOnTime = (t: Pick<TaskRecord, 'dueDate' | 'completedAt'>): boolean => Boolean(t.dueDate && t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate);

export function analyze(input: AnalyticsInput): Analytics {
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const period = input.period ?? 12;
  const first = new Date(now.getFullYear(), now.getMonth() - (period ? period - 1 : 0), 1);
  const since = period ? todayIso(first) : '0000-01-01';
  const inPeriod = (iso: string) => Boolean(iso) && iso.slice(0, 10) >= since;

  // Âmbito: dossiers da pessoa (responsável) ou todos; tarefas atribuídas à pessoa ou, sem atribuição, do responsável.
  const caseById = new Map(input.cases.map((c) => [c.id, c]));
  const cases = input.memberId ? input.cases.filter((c) => c.responsibleId === input.memberId) : input.cases;
  const belongs = (t: TaskRecord, memberId: string) => t.assigneeId === memberId || (!t.assigneeId && caseById.get(t.caseId)?.responsibleId === memberId);
  const tasks = input.tasks.filter((t) => caseById.has(t.caseId) && (!input.memberId || belongs(t, input.memberId)));
  const relevant = tasks.filter((t) => !t.obsolete && t.status !== 'na');

  // Por mês
  const keys = period ? monthRange(monthKey(since), now) : monthRange(monthKey([...input.cases.map((c) => c.createdAt), ...input.tasks.map((t) => t.completedAt).filter(Boolean), todayIso(now)].sort()[0]!), now);
  const byMonth = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, label: monthLabel(k), opened: 0, closed: 0, tasksDone: 0, onTime: 0, late: 0 }]));
  for (const c of cases) {
    const o = byMonth.get(monthKey(c.createdAt));
    if (o) o.opened += 1;
    if (isClosed(c)) {
      const cl = byMonth.get(monthKey(c.updatedAt));
      if (cl) cl.closed += 1;
    }
  }
  for (const t of relevant) {
    if (t.status !== 'concluido' || !t.completedAt) continue;
    const p = byMonth.get(monthKey(t.completedAt));
    if (!p) continue;
    p.tasksDone += 1;
    if (t.dueDate) {
      if (isOnTime(t)) p.onTime += 1;
      else p.late += 1;
    }
  }
  const months = [...byMonth.values()];

  // Por fase
  const phases: PhaseStat[] = PHASES.map((ph) => {
    const ts = relevant.filter((t) => t.phase === ph.id);
    const durations: number[] = [];
    for (const c of cases) {
      const own = ts.filter((t) => t.caseId === c.id);
      if (own.length && own.every((t) => t.status === 'concluido' && t.completedAt)) {
        const end = own.map((t) => t.completedAt).sort().pop()!;
        durations.push(days(c.createdAt, end));
      }
    }
    return {
      id: ph.id,
      label: ph.label,
      total: ts.length,
      done: ts.filter((t) => t.status === 'concluido').length,
      open: ts.filter((t) => isOpen(t.status)).length,
      overdue: ts.filter((t) => isOpen(t.status) && t.dueDate && t.dueDate < today).length,
      casesCompleted: durations.length,
      medianDays: median(durations),
      meanDays: mean(durations),
    };
  });

  // Por pessoa
  const recentSince = todayIso(new Date(now.getTime() - 30 * DAY));
  const memberList = input.memberId ? input.members.filter((m) => m.id === input.memberId) : input.members;
  const members: MemberStat[] = memberList.map((m) => {
    const mine = input.tasks.filter((t) => !t.obsolete && t.status !== 'na' && caseById.has(t.caseId) && belongs(t, m.id));
    const activeMine = mine.filter((t) => isActive(caseById.get(t.caseId)!));
    const donePeriod = mine.filter((t) => t.status === 'concluido' && inPeriod(t.completedAt));
    const withDue = donePeriod.filter((t) => t.dueDate);
    return {
      id: m.id,
      name: m.name,
      color: m.color,
      activeCases: input.cases.filter((c) => isActive(c) && c.responsibleId === m.id).length,
      openTasks: activeMine.filter((t) => isOpen(t.status)).length,
      overdue: activeMine.filter((t) => isOpen(t.status) && t.dueDate && t.dueDate < today).length,
      doneRecent: mine.filter((t) => t.status === 'concluido' && t.completedAt.slice(0, 10) >= recentSince).length,
      onTimeRate: rate(withDue.filter(isOnTime).length, withDue.length),
      meanCompletionDays: mean(donePeriod.map((t) => days(t.createdAt, t.completedAt))),
    };
  });

  // Indicadores globais (âmbito atual)
  const donePeriod = relevant.filter((t) => t.status === 'concluido' && inPeriod(t.completedAt));
  const withDue = donePeriod.filter((t) => t.dueDate);
  const closedPeriod = cases.filter((c) => isClosed(c) && inPeriod(c.updatedAt));
  const activeTasks = relevant.filter((t) => isActive(caseById.get(t.caseId)!));
  return {
    since,
    months,
    phases,
    members,
    kpis: {
      activeCases: cases.filter(isActive).length,
      closedCases: closedPeriod.length,
      openTasks: activeTasks.filter((t) => isOpen(t.status)).length,
      overdueOpen: activeTasks.filter((t) => isOpen(t.status) && t.dueDate && t.dueDate < today).length,
      tasksDone: donePeriod.length,
      onTimeRate: rate(withDue.filter(isOnTime).length, withDue.length),
      meanCloseDays: mean(closedPeriod.map((c) => days(c.createdAt, c.updatedAt))),
    },
  };
}

export const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`);
export const daysLabel = (d: number | null): string => (d === null ? '—' : d >= 10 ? `${Math.round(d)} dias` : `${d} dias`);

/** Linhas para exportação CSV da tabela por pessoa. */
export function membersCsv(a: Analytics): { header: string[]; rows: (string | number)[][] } {
  return {
    header: ['Pessoa', 'Dossiers ativos', 'Tarefas em aberto', 'Em atraso', 'Concluídas (30 dias)', 'Prazos cumpridos', 'Tempo médio de conclusão (dias)'],
    rows: a.members.map((m) => [m.name, m.activeCases, m.openTasks, m.overdue, m.doneRecent, m.onTimeRate === null ? '' : Math.round(m.onTimeRate * 100), m.meanCompletionDays ?? '']),
  };
}

/** Linhas para exportação CSV da série mensal. */
export function monthsCsv(a: Analytics): { header: string[]; rows: (string | number)[][] } {
  return {
    header: ['Mês', 'Dossiers abertos', 'Dossiers encerrados', 'Tarefas concluídas', 'Prazos cumpridos', 'Prazos falhados'],
    rows: a.months.map((m) => [m.label, m.opened, m.closed, m.tasksDone, m.onTime, m.late]),
  };
}
