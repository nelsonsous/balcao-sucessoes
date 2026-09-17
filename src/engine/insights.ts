// Leitura inteligente de um dossier: semáforo global, bloqueios e próxima ação.
import type { Status, TaskRecord } from '../lib/types';
import { daysFromToday } from '../lib/utils';
import { dueState } from './deadlines';
import { isOpen } from './phases';

export interface TaskStats {
  byStatus: Record<Status, number>;
  total: number;
  applicable: number;
  done: number;
  open: number;
  pct: number;
  overdue: number;
  dueSoon: number;
  criticalPending: number;
  obsolete: number;
}

const live = (t: TaskRecord) => !t.obsolete;

export function taskStats(tasks: TaskRecord[], today = new Date()): TaskStats {
  const byStatus: Record<Status, number> = { pendente: 0, em_curso: 0, aguarda: 0, concluido: 0, na: 0 };
  let overdue = 0;
  let dueSoon = 0;
  let criticalPending = 0;
  let obsolete = 0;
  for (const t of tasks) {
    if (t.obsolete) {
      obsolete += 1;
      continue;
    }
    byStatus[t.status] += 1;
    const ds = dueState(t.dueDate, t.status, today);
    if (ds === 'atrasado') overdue += 1;
    if (ds === 'hoje' || ds === 'urgente' || ds === 'proximo') dueSoon += 1;
    if (t.critical && t.status === 'pendente') criticalPending += 1;
  }
  const total = tasks.filter(live).length;
  const applicable = total - byStatus.na;
  const done = byStatus.concluido;
  const open = byStatus.pendente + byStatus.em_curso + byStatus.aguarda;
  return {
    byStatus,
    total,
    applicable,
    done,
    open,
    pct: applicable ? Math.round((done / applicable) * 100) : 0,
    overdue,
    dueSoon,
    criticalPending,
    obsolete,
  };
}

export type HealthLevel = 'vermelho' | 'laranja' | 'azul' | 'verde' | 'cinzento';

export interface Health {
  level: HealthLevel;
  label: string;
  detail: string;
}

/** Semáforo global do dossier. */
export function caseHealth(s: TaskStats): Health {
  if (s.total === 0) return { level: 'cinzento', label: 'Sem tarefas', detail: 'Ainda não há checklist.' };
  if (s.overdue > 0)
    return { level: 'vermelho', label: 'Prazo ultrapassado', detail: `${s.overdue} prazo(s) ultrapassado(s)` };
  if (s.criticalPending > 0)
    return {
      level: 'vermelho',
      label: 'Precisa de atenção',
      detail: `${s.criticalPending} tarefa(s) crítica(s) por iniciar`,
    };
  if (s.open === 0) return { level: 'verde', label: 'Concluído', detail: 'Todas as tarefas aplicáveis estão concluídas.' };
  if (s.byStatus.aguarda > 0 && s.byStatus.aguarda === s.open)
    return { level: 'azul', label: 'A aguardar terceiros', detail: `${s.byStatus.aguarda} tarefa(s) dependem de terceiros` };
  return { level: 'laranja', label: 'Em andamento', detail: `${s.open} tarefa(s) em aberto` };
}

/** Pontuação de urgência: quanto menor, mais urgente. */
function urgency(t: TaskRecord, today: Date): number {
  const d = t.dueDate ? daysFromToday(t.dueDate, today) : null;
  if (d !== null && d < 0) return 0 + d / 10_000; // atrasadas, as mais antigas primeiro
  if (d !== null && d <= 14) return 1 + d / 100;
  if (t.critical && t.status === 'pendente') return 2;
  if (t.critical && t.status === 'em_curso') return 3;
  if (t.status === 'em_curso') return 4;
  if (t.status === 'pendente') return 5;
  return 6; // a aguardar terceiros
}

export function rankOpenTasks(tasks: TaskRecord[], today = new Date()): TaskRecord[] {
  return tasks
    .filter((t) => live(t) && isOpen(t.status))
    .sort((a, b) => urgency(a, today) - urgency(b, today) || a.order - b.order);
}

export function nextAction(tasks: TaskRecord[], today = new Date()): TaskRecord | undefined {
  return rankOpenTasks(tasks, today)[0];
}

export interface Blockers {
  overdue: TaskRecord[];
  criticalPending: TaskRecord[];
  awaiting: TaskRecord[];
  dueSoon: TaskRecord[];
  obsolete: TaskRecord[];
  count: number;
}

/** "O que está a bloquear?" */
export function blockers(tasks: TaskRecord[], today = new Date()): Blockers {
  const liveOpen = tasks.filter((t) => live(t) && isOpen(t.status));
  const overdue = liveOpen.filter((t) => dueState(t.dueDate, t.status, today) === 'atrasado');
  const overdueIds = new Set(overdue.map((t) => t.id));
  const criticalPending = liveOpen.filter((t) => t.critical && t.status === 'pendente' && !overdueIds.has(t.id));
  const awaiting = liveOpen.filter((t) => t.status === 'aguarda' && !overdueIds.has(t.id));
  const dueSoon = liveOpen.filter((t) => {
    const s = dueState(t.dueDate, t.status, today);
    return (s === 'hoje' || s === 'urgente' || s === 'proximo') && !overdueIds.has(t.id);
  });
  const obsolete = tasks.filter((t) => t.obsolete);
  return {
    overdue,
    criticalPending,
    awaiting,
    dueSoon,
    obsolete,
    count: overdue.length + criticalPending.length + awaiting.length,
  };
}

/** Fase em que o dossier está: a primeira com trabalho em aberto. */
export function currentPhase(tasks: TaskRecord[]): TaskRecord['phase'] | undefined {
  return [...tasks].filter((t) => live(t) && isOpen(t.status)).sort((a, b) => a.order - b.order)[0]?.phase;
}
