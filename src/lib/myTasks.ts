// "As minhas tarefas": trabalho em aberto atribuído a uma pessoa da equipa,
// agrupado por urgência. Uma tarefa sem responsável conta para o responsável do dossier.
import { isOpen, PHASE_INDEX } from '../engine/phases';
import type { CaseRecord, TaskRecord } from './types';
import { daysFromToday } from './utils';

export type MyGroupId = 'atrasadas' | 'hoje' | 'semana' | 'proximas' | 'sem_prazo';

export interface MyGroup {
  id: MyGroupId;
  label: string;
  tasks: Array<{ t: TaskRecord; c: CaseRecord }>;
}

export const MY_GROUP_LABELS: Record<MyGroupId, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Para hoje',
  semana: 'Esta semana',
  proximas: 'Próximas',
  sem_prazo: 'Sem prazo',
};

export function isMine(t: TaskRecord, c: CaseRecord, meId: string): boolean {
  if (!meId) return false;
  return t.assigneeId ? t.assigneeId === meId : c.responsibleId === meId;
}

export function groupMyTasks(cases: Array<{ c: CaseRecord; tasks: TaskRecord[] }>, meId: string, today = new Date()): MyGroup[] {
  const groups: Record<MyGroupId, MyGroup['tasks']> = { atrasadas: [], hoje: [], semana: [], proximas: [], sem_prazo: [] };
  for (const { c, tasks } of cases) {
    if (c.stage !== 'ativo') continue;
    for (const t of tasks) {
      if (t.obsolete || !isOpen(t.status) || !isMine(t, c, meId)) continue;
      const n = t.dueDate ? daysFromToday(t.dueDate, today) : null;
      const g: MyGroupId = n === null ? 'sem_prazo' : n < 0 ? 'atrasadas' : n === 0 ? 'hoje' : n <= 7 ? 'semana' : 'proximas';
      groups[g].push({ t, c });
    }
  }
  const byDue = (a: { t: TaskRecord }, b: { t: TaskRecord }) => a.t.dueDate.localeCompare(b.t.dueDate) || Number(b.t.critical) - Number(a.t.critical);
  const byImportance = (a: { t: TaskRecord }, b: { t: TaskRecord }) =>
    Number(b.t.critical) - Number(a.t.critical) || PHASE_INDEX[a.t.phase] - PHASE_INDEX[b.t.phase] || a.t.order - b.t.order;
  return (Object.keys(groups) as MyGroupId[]).map((id) => ({
    id,
    label: MY_GROUP_LABELS[id],
    tasks: groups[id].sort(id === 'sem_prazo' ? byImportance : byDue),
  }));
}
