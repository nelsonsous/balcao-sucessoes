// Regras do escritório na base de dados: gravar, ativar/desativar, aplicar aos
// dossiers ativos e mostrar o que falta aplicar (antes de mexer em qualquer dossier).
import { useLiveQuery } from 'dexie-react-hooks';
import { desiredTasks } from '../engine/engine';
import { OFFICE_RULE_EXAMPLES, isOfficeKey } from '../engine/officeRules';
import { emptyReport, planSync, syncCaseTasks, type SyncReport } from '../engine/sync';
import { db, newOfficeRule, newOfficeRuleTask } from './db';
import type { CaseRecord, OfficeRuleRecord, TaskRecord } from './types';
import { pushUndo } from './undo';
import { nowIso, uid } from './utils';

/** As regras aplicam-se aos dossiers em curso (ativos ou suspensos) e aos novos. */
export const isRuleTarget = (c: CaseRecord): boolean => c.stage === 'ativo' || c.stage === 'suspenso';

export function useOfficeRules(): OfficeRuleRecord[] | undefined {
  return useLiveQuery(() => db.officeRules.toArray(), []);
}

/** Regras ativas (para o assistente e o questionário mostrarem as tarefas que vão surgir). */
export function useActiveOfficeRules(): OfficeRuleRecord[] {
  return useLiveQuery(async () => (await db.officeRules.toArray()).filter((r) => r.enabled), [], []);
}

export async function saveOfficeRule(r: OfficeRuleRecord): Promise<void> {
  await db.officeRules.put({ ...r, name: r.name.trim(), reason: r.reason.trim(), updatedAt: nowIso() });
}

export async function setOfficeRuleEnabled(r: OfficeRuleRecord, enabled: boolean): Promise<void> {
  await db.officeRules.update(r.id, { enabled, updatedAt: nowIso() });
}

/** Remove a regra (com «anular»). As tarefas nos dossiers só mudam ao aplicar. */
export async function deleteOfficeRule(r: OfficeRuleRecord): Promise<void> {
  await db.officeRules.delete(r.id);
  pushUndo(`Regra removida: «${r.name}»`, async () => {
    await db.officeRules.put(r);
  });
}

/** Cópia desativada (para não duplicar tarefas enquanto se adapta). */
export async function duplicateOfficeRule(r: OfficeRuleRecord): Promise<OfficeRuleRecord> {
  const ts = nowIso();
  const copy: OfficeRuleRecord = {
    ...r,
    id: uid(),
    name: `${r.name} (cópia)`,
    enabled: false,
    conditions: r.conditions.map((c) => ({ ...c })),
    tasks: r.tasks.map((t) => ({ ...t, key: uid(), docs: [...t.docs], legal: [...t.legal], ...(t.deadline ? { deadline: { ...t.deadline } } : {}) })),
    createdAt: ts,
    updatedAt: ts,
  };
  await db.officeRules.add(copy);
  return copy;
}

/** Regra nova a partir de um dos exemplos. */
export async function addExampleRule(index: number): Promise<OfficeRuleRecord> {
  const ex = OFFICE_RULE_EXAMPLES[index];
  if (!ex) throw new Error('Exemplo inexistente.');
  const r = newOfficeRule({
    name: ex.name,
    reason: ex.reason,
    match: ex.match,
    conditions: ex.conditions.map((c) => ({ ...c })),
    tasks: ex.tasks.map((t) => newOfficeRuleTask({ ...t, docs: [...t.docs], legal: [...t.legal], ...(t.deadline ? { deadline: { ...t.deadline } } : {}) })),
  });
  await db.officeRules.add(r);
  return r;
}

export interface OfficeDrift {
  /** Dossiers em curso com tarefas das regras por acrescentar, atualizar ou retirar. */
  caseIds: string[];
  add: number;
  update: number;
  remove: number;
  obsolete: number;
}

/** Diferença entre as regras atuais e as checklists dos dossiers em curso (puro). */
export function officeDrift(cases: CaseRecord[], tasks: TaskRecord[], rules: OfficeRuleRecord[]): OfficeDrift {
  const enabled = rules.filter((r) => r.enabled);
  const byCase = new Map<string, TaskRecord[]>();
  for (const t of tasks) {
    const list = byCase.get(t.caseId);
    if (list) list.push(t);
    else byCase.set(t.caseId, [t]);
  }
  const out: OfficeDrift = { caseIds: [], add: 0, update: 0, remove: 0, obsolete: 0 };
  for (const c of cases) {
    if (!isRuleTarget(c)) continue;
    const plan = planSync(c, byCase.get(c.id) ?? [], desiredTasks(c.answers, enabled));
    const add = plan.add.filter((x) => isOfficeKey(x.d.key)).length;
    const update = plan.update.filter((x) => isOfficeKey(x.task.ruleKey)).length;
    const remove = plan.remove.filter((t) => isOfficeKey(t.ruleKey)).length;
    const obsolete = plan.obsolete.filter((t) => isOfficeKey(t.ruleKey)).length;
    if (!(add + update + remove + obsolete)) continue;
    out.caseIds.push(c.id);
    out.add += add;
    out.update += update;
    out.remove += remove;
    out.obsolete += obsolete;
  }
  return out;
}

export function describeDrift(d: OfficeDrift): string {
  const parts: string[] = [];
  if (d.add) parts.push(`${d.add} ${d.add === 1 ? 'tarefa por acrescentar' : 'tarefas por acrescentar'}`);
  if (d.update) parts.push(`${d.update} ${d.update === 1 ? 'tarefa por atualizar' : 'tarefas por atualizar'}`);
  if (d.remove) parts.push(`${d.remove} por retirar (ainda por começar)`);
  if (d.obsolete) parts.push(`${d.obsolete} com trabalho, que ficará «a rever»`);
  return parts.join(' · ');
}

export interface ApplySummary extends SyncReport {
  /** Dossiers em curso avaliados. */
  cases: number;
  /** Dossiers cuja checklist mudou. */
  changedCases: number;
}

/** Reconcilia a checklist de todos os dossiers em curso com as regras atuais (fica no histórico de cada um). */
export async function applyOfficeRules(): Promise<ApplySummary> {
  const rules = (await db.officeRules.toArray()).filter((r) => r.enabled);
  const cases = (await db.cases.toArray()).filter(isRuleTarget);
  const total: ApplySummary = { ...emptyReport(), cases: cases.length, changedCases: 0 };
  for (const c of cases) {
    const r = await syncCaseTasks(c, { log: true, logLabel: 'Checklist atualizada pelas regras do escritório', officeRules: rules });
    if (r.added.length + r.removed.length + r.obsoleted.length + r.updated) total.changedCases += 1;
    total.added.push(...r.added);
    total.removed.push(...r.removed);
    total.obsoleted.push(...r.obsoleted);
    total.reactivated.push(...r.reactivated);
    total.dueUpdated += r.dueUpdated;
    total.updated += r.updated;
  }
  return total;
}

/** Diferença atual, lida da base de dados (para confirmar antes de aplicar). */
export async function loadOfficeDrift(): Promise<OfficeDrift> {
  const [rules, cases] = await Promise.all([db.officeRules.toArray(), db.cases.toArray()]);
  const ids = cases.filter(isRuleTarget).map((c) => c.id);
  const tasks = ids.length ? await db.tasks.where('caseId').anyOf(ids).toArray() : [];
  return officeDrift(cases, tasks, rules);
}
