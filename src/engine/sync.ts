// Reconciliação da checklist com as respostas atuais do dossier.
// Novas regras aplicáveis → tarefas novas. Regras que deixaram de se aplicar →
// tarefas intocadas são removidas; tarefas com trabalho ficam marcadas para revisão.
import { db, logActivity, newTask } from '../lib/db';
import type { CaseRecord, TaskRecord } from '../lib/types';
import { nowIso } from '../lib/utils';
import { desiredTasks, dueFor } from './engine';

export interface SyncReport {
  added: string[];
  removed: string[];
  obsoleted: string[];
  reactivated: string[];
  dueUpdated: number;
}

export function emptyReport(): SyncReport {
  return { added: [], removed: [], obsoleted: [], reactivated: [], dueUpdated: 0 };
}

export async function syncCaseTasks(c: CaseRecord, opts: { log?: boolean } = {}): Promise<SyncReport> {
  const report = emptyReport();
  const desired = desiredTasks(c.answers);
  const wanted = new Set(desired.map((d) => d.key));

  await db.transaction('rw', db.tasks, async () => {
    const existing = await db.tasks.where('caseId').equals(c.id).toArray();
    const byKey = new Map<string, TaskRecord>();
    for (const t of existing) if (t.ruleKey) byKey.set(t.ruleKey, t);
    const ts = nowIso();

    for (const d of desired) {
      const due = dueFor(d, c.deceased.deathDate);
      const cur = byKey.get(d.key);
      if (!cur) {
        await db.tasks.add(
          newTask(c.id, {
            ruleKey: d.key,
            phase: d.phase,
            title: d.title,
            description: d.description,
            critical: d.critical,
            status: d.initialStatus,
            legal: d.legal,
            docs: d.docs,
            reason: d.reason,
            order: d.order,
            dueDate: due.dueDate,
            dueLabel: due.dueLabel,
            dueSource: due.dueDate ? 'regra' : '',
          }),
        );
        report.added.push(d.title);
        continue;
      }
      // Tarefa já existe: atualiza o conteúdo da biblioteca, mantém o trabalho feito
      // (estado, notas, responsável, prazo manual e criticidade escolhida pela equipa).
      const patch: Partial<TaskRecord> = {
        phase: d.phase,
        title: d.title,
        description: d.description,
        legal: d.legal,
        docs: d.docs,
        reason: d.reason,
        order: d.order,
        dueLabel: due.dueLabel,
      };
      if (cur.obsolete) {
        patch.obsolete = false;
        report.reactivated.push(d.title);
      }
      if (cur.dueSource !== 'manual' && cur.dueDate !== due.dueDate) {
        patch.dueDate = due.dueDate;
        patch.dueSource = due.dueDate ? 'regra' : '';
        report.dueUpdated += 1;
      }
      const changed = (Object.keys(patch) as Array<keyof TaskRecord>).some(
        (k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k]),
      );
      if (changed) await db.tasks.update(cur.id, { ...patch, updatedAt: ts });
    }

    for (const t of existing) {
      if (!t.ruleKey || wanted.has(t.ruleKey) || t.obsolete) continue;
      const untouched = t.status === 'pendente' && !t.notes.trim() && !t.assigneeId;
      if (untouched) {
        await db.tasks.delete(t.id);
        report.removed.push(t.title);
      } else {
        await db.tasks.update(t.id, { obsolete: true, updatedAt: ts });
        report.obsoleted.push(t.title);
      }
    }
  });

  if (opts.log) {
    const parts: string[] = [];
    if (report.added.length) parts.push(`${report.added.length} nova(s)`);
    if (report.removed.length) parts.push(`${report.removed.length} removida(s)`);
    if (report.obsoleted.length) parts.push(`${report.obsoleted.length} para rever`);
    if (report.reactivated.length) parts.push(`${report.reactivated.length} reativada(s)`);
    if (parts.length) await logActivity(c.id, 'questionario', `Checklist atualizada: ${parts.join(', ')}`);
  }
  return report;
}

export function describeReport(r: SyncReport): string {
  const parts: string[] = [];
  if (r.added.length) parts.push(`+${r.added.length} tarefa(s)`);
  if (r.removed.length) parts.push(`−${r.removed.length} removida(s)`);
  if (r.obsoleted.length) parts.push(`${r.obsoleted.length} a rever`);
  if (r.reactivated.length) parts.push(`${r.reactivated.length} reativada(s)`);
  if (r.dueUpdated) parts.push(`${r.dueUpdated} prazo(s) recalculado(s)`);
  return parts.length ? parts.join(' · ') : 'A checklist já estava atualizada';
}
