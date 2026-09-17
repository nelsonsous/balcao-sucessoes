// Motor da checklist adaptativa (puro, sem acesso à base de dados).
import type { Answers, PhaseId, Status } from '../lib/types';
import { computeDeadline, type DeadlineSpec } from './deadlines';
import { PHASE_INDEX } from './phases';
import { RULES } from './rules';

export interface DesiredTask {
  key: string;
  ruleId: string;
  phase: PhaseId;
  title: string;
  description: string;
  critical: boolean;
  initialStatus: Status;
  legal: string[];
  docs: string[];
  reason: string;
  deadline?: DeadlineSpec;
  order: number;
}

/** Avalia todas as regras e devolve as tarefas aplicáveis (sem duplicados). */
export function desiredTasks(a: Answers): DesiredTask[] {
  const seen = new Set<string>();
  const out: DesiredTask[] = [];
  RULES.forEach((rule, ri) => {
    if (!rule.when(a)) return;
    const reason = typeof rule.reason === 'function' ? rule.reason(a) : rule.reason;
    rule.tasks.forEach((t, ti) => {
      if (seen.has(t.key)) return;
      seen.add(t.key);
      const deadline = typeof t.deadline === 'function' ? t.deadline(a) : t.deadline;
      out.push({
        key: t.key,
        ruleId: rule.id,
        phase: t.phase,
        title: t.title,
        description: t.description,
        critical: Boolean(t.critical),
        initialStatus: t.initialStatus ?? 'pendente',
        legal: t.legal ?? [],
        docs: t.docs ?? [],
        reason,
        deadline,
        order: PHASE_INDEX[t.phase] * 1000 + ri * 10 + ti,
      });
    });
  });
  return out.sort((x, y) => x.order - y.order);
}

export function dueFor(t: DesiredTask, deathDate: string): { dueDate: string; dueLabel: string } {
  if (!t.deadline) return { dueDate: '', dueLabel: '' };
  return { dueDate: computeDeadline(t.deadline, deathDate), dueLabel: t.deadline.label };
}

export interface PhaseCount {
  phase: PhaseId;
  total: number;
  critical: number;
}

export function countByPhase(tasks: Array<{ phase: PhaseId; critical: boolean }>): PhaseCount[] {
  const map = new Map<PhaseId, PhaseCount>();
  for (const t of tasks) {
    const c = map.get(t.phase) ?? { phase: t.phase, total: 0, critical: 0 };
    c.total += 1;
    if (t.critical) c.critical += 1;
    map.set(t.phase, c);
  }
  return [...map.values()].sort((x, y) => PHASE_INDEX[x.phase] - PHASE_INDEX[y.phase]);
}
