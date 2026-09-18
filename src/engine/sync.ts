// Reconciliação da checklist com as respostas atuais do dossier.
// Novas regras aplicáveis → tarefas novas. Regras que deixaram de se aplicar →
// tarefas intocadas são removidas; tarefas com trabalho ficam marcadas para revisão.
import { db, logActivity, newTask } from '../lib/db';
import type { CaseRecord, OfficeRuleRecord, TaskRecord } from '../lib/types';
import { nowIso } from '../lib/utils';
import { desiredTasks, dueFor, type DesiredTask } from './engine';

export interface SyncReport {
  added: string[];
  removed: string[];
  obsoleted: string[];
  reactivated: string[];
  dueUpdated: number;
  /** Tarefas existentes cujo conteúdo foi atualizado (inclui reativações e prazos). */
  updated: number;
}

export function emptyReport(): SyncReport {
  return { added: [], removed: [], obsoleted: [], reactivated: [], dueUpdated: 0, updated: 0 };
}

export interface SyncOptions {
  log?: boolean;
  /** Texto do histórico (por omissão, «Checklist atualizada»). */
  logLabel?: string;
  /** Regras do escritório já lidas (evita ler a tabela em cada dossier). */
  officeRules?: OfficeRuleRecord[];
}

/** Regras do escritório ativas. */
export async function activeOfficeRules(): Promise<OfficeRuleRecord[]> {
  return (await db.officeRules.toArray()).filter((r) => r.enabled);
}

/** O que a reconciliação vai fazer (puro: não escreve nada). */
export interface SyncPlan {
  add: Array<{ d: DesiredTask; dueDate: string; dueLabel: string }>;
  update: Array<{ task: TaskRecord; patch: Partial<TaskRecord> }>;
  /** Títulos das tarefas que voltam a aplicar-se. */
  reactivated: string[];
  dueUpdated: number;
  /** Tarefas intocadas que deixam de se aplicar (removidas). */
  remove: TaskRecord[];
  /** Tarefas com trabalho que deixam de se aplicar (ficam para rever). */
  obsolete: TaskRecord[];
}

export function planSync(c: CaseRecord, existing: TaskRecord[], desired: DesiredTask[]): SyncPlan {
  const plan: SyncPlan = { add: [], update: [], reactivated: [], dueUpdated: 0, remove: [], obsolete: [] };
  const wanted = new Set(desired.map((d) => d.key));
  const byKey = new Map<string, TaskRecord>();
  for (const t of existing) if (t.ruleKey) byKey.set(t.ruleKey, t);

  for (const d of desired) {
    const due = dueFor(d, c.deceased.deathDate);
    const cur = byKey.get(d.key);
    if (!cur) {
      plan.add.push({ d, ...due });
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
      plan.reactivated.push(d.title);
    }
    if (cur.dueSource !== 'manual' && cur.dueDate !== due.dueDate) {
      patch.dueDate = due.dueDate;
      patch.dueSource = due.dueDate ? 'regra' : '';
      plan.dueUpdated += 1;
    }
    const changed = (Object.keys(patch) as Array<keyof TaskRecord>).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k]));
    if (changed) plan.update.push({ task: cur, patch });
  }

  for (const t of existing) {
    if (!t.ruleKey || wanted.has(t.ruleKey) || t.obsolete) continue;
    const untouched = t.status === 'pendente' && !t.notes.trim() && !t.assigneeId;
    (untouched ? plan.remove : plan.obsolete).push(t);
  }
  return plan;
}

export async function syncCaseTasks(c: CaseRecord, opts: SyncOptions = {}): Promise<SyncReport> {
  const report = emptyReport();
  const office = opts.officeRules ?? (await activeOfficeRules());
  const desired = desiredTasks(c.answers, office);

  await db.transaction('rw', db.tasks, async () => {
    const existing = await db.tasks.where('caseId').equals(c.id).toArray();
    const plan = planSync(c, existing, desired);
    const ts = nowIso();
    for (const { d, dueDate, dueLabel } of plan.add) {
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
          dueDate,
          dueLabel,
          dueSource: dueDate ? 'regra' : '',
        }),
      );
      report.added.push(d.title);
    }
    for (const { task, patch } of plan.update) await db.tasks.update(task.id, { ...patch, updatedAt: ts });
    report.reactivated.push(...plan.reactivated);
    report.dueUpdated = plan.dueUpdated;
    report.updated = plan.update.length;
    for (const t of plan.remove) {
      await db.tasks.delete(t.id);
      report.removed.push(t.title);
    }
    for (const t of plan.obsolete) {
      await db.tasks.update(t.id, { obsolete: true, updatedAt: ts });
      report.obsoleted.push(t.title);
    }
  });

  if (opts.log) {
    const parts: string[] = [];
    if (report.added.length) parts.push(`${report.added.length} nova(s)`);
    if (report.removed.length) parts.push(`${report.removed.length} removida(s)`);
    if (report.obsoleted.length) parts.push(`${report.obsoleted.length} para rever`);
    if (report.reactivated.length) parts.push(`${report.reactivated.length} reativada(s)`);
    if (parts.length) await logActivity(c.id, 'questionario', `${opts.logLabel ?? 'Checklist atualizada'}: ${parts.join(', ')}`);
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
