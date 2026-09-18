// Operações de escrita. Cada alteração relevante fica no histórico do dossier.
import { phaseLabel, statusLabel } from '../engine/phases';
import type { SyncReport } from '../engine/sync';
import {
  db,
  deleteCaseCascade,
  logActivity,
  newCase,
  newAsset,
  newDebt,
  newParty,
  newTask,
  nextCaseRef,
  touchCase,
} from './db';
import { ENTITY_LABELS, type ImportEntity } from './labels';
import type { ImportRow } from './sheetImport';

/** O motor da checklist (59 regras) só se carrega quando é preciso reconciliar. */
const loadSync = () => import('../engine/sync');
import type { AssetRecord, CaseRecord, CaseTemplateRecord, ContactLogRecord, DebtRecord, EventRecord, MemberRecord, NoteRecord, PartyRecord, Status, TaskRecord, TrashRecord } from './types';
import { restoreTrash, trashCase, trashRecord } from './recycle';
import { pushUndo } from './undo';
import { formatDate, nowIso, uid } from './utils';

// ---------------- Dossiers

export async function createCase(data: Partial<CaseRecord>): Promise<{ c: CaseRecord; report: SyncReport }> {
  const c = newCase({ ...data, ref: data.ref || (await nextCaseRef()) });
  await db.cases.add(c);
  const { syncCaseTasks } = await loadSync();
  const report = await syncCaseTasks(c);
  await logActivity(c.id, 'dossier', `Dossier criado com ${report.added.length} tarefas geradas pelo questionário`);
  return { c, report };
}

export async function updateCase(id: string, patch: Partial<CaseRecord>, log?: string): Promise<void> {
  await db.cases.update(id, { ...patch, updatedAt: nowIso() });
  if (log) await logActivity(id, 'dossier', log);
}

/** Guarda novas respostas e reconcilia a checklist. */
export async function saveAnswers(c: CaseRecord, answers: CaseRecord['answers']): Promise<SyncReport> {
  const next = { ...c, answers, updatedAt: nowIso() };
  await db.cases.put(next);
  await logActivity(c.id, 'questionario', 'Questionário sucessório atualizado');
  const { syncCaseTasks } = await loadSync();
  return syncCaseTasks(next, { log: true });
}

/** Atualiza dados do dossier; se a data do óbito mudar, recalcula prazos. */
export async function saveCaseDetails(c: CaseRecord, patch: Partial<CaseRecord>): Promise<void> {
  const next = { ...c, ...patch, updatedAt: nowIso() };
  await db.cases.put(next);
  await logActivity(c.id, 'dossier', 'Dados do dossier atualizados');
  if (patch.deceased && patch.deceased.deathDate !== c.deceased.deathDate) await (await loadSync()).syncCaseTasks(next);
}

/** Elimina um dossier para a reciclagem (30 dias), com «anular». */
export async function removeCase(c: CaseRecord): Promise<void> {
  const entry = await trashCase(c);
  pushUndo(`Dossier eliminado: ${c.ref}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem, com tudo o que lhe pertence.');
}

/** Elimina um dossier definitivamente (sem reciclagem). */
export async function destroyCase(c: CaseRecord): Promise<void> {
  await deleteCaseCascade(c.id);
}

/** Duplica dados e questionário (útil como modelo); não copia interessados nem bens. */
export async function duplicateCase(c: CaseRecord): Promise<CaseRecord> {
  const { c: copy } = await createCase({
    name: `${c.name} (cópia)`,
    deceased: { ...c.deceased },
    client: { ...c.client },
    responsibleId: c.responsibleId,
    priority: c.priority,
    tags: [...c.tags],
    answers: structuredClone(c.answers),
  });
  return copy;
}

// ---------------- Tarefas

export async function setTaskStatus(t: TaskRecord, status: Status): Promise<void> {
  if (t.status === status) return;
  await db.tasks.update(t.id, {
    status,
    completedAt: status === 'concluido' ? nowIso() : '',
    updatedAt: nowIso(),
  });
  await touchCase(t.caseId);
  await logActivity(t.caseId, 'tarefa', `“${t.title}”: ${statusLabel(t.status)} → ${statusLabel(status)}`);
  pushUndo(`“${t.title}” → ${statusLabel(status)}`, async () => {
    await db.tasks.update(t.id, { status: t.status, completedAt: t.completedAt, updatedAt: nowIso() });
    await touchCase(t.caseId);
    await logActivity(t.caseId, 'tarefa', `Anulado: “${t.title}” volta a ${statusLabel(t.status)}`);
  });
}

export async function updateTask(t: TaskRecord, patch: Partial<TaskRecord>, log?: string): Promise<void> {
  await db.tasks.update(t.id, { ...patch, updatedAt: nowIso() });
  await touchCase(t.caseId);
  if (log) await logActivity(t.caseId, 'tarefa', log);
}

export async function addCustomTask(caseId: string, data: Pick<TaskRecord, 'title' | 'phase'> & Partial<TaskRecord>): Promise<TaskRecord> {
  const count = await db.tasks.where('caseId').equals(caseId).count();
  const t = newTask(caseId, {
    ...data,
    order: 10_000 + count,
    reason: 'Tarefa acrescentada pela equipa',
    dueSource: data.dueDate ? 'manual' : '',
  });
  await db.tasks.add(t);
  await touchCase(caseId);
  await logActivity(caseId, 'tarefa', `Tarefa acrescentada em ${phaseLabel(t.phase)}: “${t.title}”`);
  return t;
}

export async function deleteTask(t: TaskRecord): Promise<void> {
  const entry = await trashRecord('tasks', t, `“${t.title}”`);
  await logActivity(t.caseId, 'tarefa', `Tarefa removida (na reciclagem): “${t.title}”`);
  pushUndo(`Tarefa removida: “${t.title}”`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

export async function restoreTask(t: TaskRecord): Promise<void> {
  await db.tasks.put(t);
  await logActivity(t.caseId, 'tarefa', `Tarefa reposta: “${t.title}”`);
}

// ---------------- Interessados

export async function saveParty(p: PartyRecord, isNew: boolean): Promise<void> {
  if (p.isHeadOfEstate) {
    // Só pode haver um cabeça-de-casal por dossier.
    const others = await db.parties.where('caseId').equals(p.caseId).filter((x) => x.id !== p.id && x.isHeadOfEstate).toArray();
    for (const o of others) await db.parties.update(o.id, { isHeadOfEstate: false });
  }
  await db.parties.put({ ...p, updatedAt: nowIso() });
  await touchCase(p.caseId);
  await logActivity(p.caseId, 'interessado', `${isNew ? 'Interessado adicionado' : 'Interessado atualizado'}: ${p.name || 'sem nome'}`);
}

export async function deleteParty(p: PartyRecord): Promise<void> {
  const entry = await trashRecord('parties', p, p.name || 'sem nome');
  await logActivity(p.caseId, 'interessado', `Interessado removido (na reciclagem): ${p.name}`);
  pushUndo(`Interessado removido: ${p.name || 'sem nome'}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

// ---------------- Património e passivo

export async function saveAsset(a: AssetRecord, isNew: boolean): Promise<void> {
  await db.assets.put({ ...a, updatedAt: nowIso() });
  await touchCase(a.caseId);
  await logActivity(a.caseId, 'patrimonio', `${isNew ? 'Bem adicionado' : 'Bem atualizado'}: ${a.description || 'sem descrição'}`);
}

export async function deleteAsset(a: AssetRecord): Promise<void> {
  const entry = await trashRecord('assets', a, a.description || 'sem descrição');
  await logActivity(a.caseId, 'patrimonio', `Bem removido (na reciclagem): ${a.description}`);
  pushUndo(`Bem removido: ${a.description || 'sem descrição'}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

export async function saveDebt(d: DebtRecord, isNew: boolean): Promise<void> {
  await db.debts.put({ ...d, updatedAt: nowIso() });
  await touchCase(d.caseId);
  await logActivity(d.caseId, 'passivo', `${isNew ? 'Dívida adicionada' : 'Dívida atualizada'}: ${d.creditor || 'credor por indicar'}`);
}

export async function deleteDebt(d: DebtRecord): Promise<void> {
  const entry = await trashRecord('debts', d, d.creditor || 'credor por indicar');
  await logActivity(d.caseId, 'passivo', `Dívida removida (na reciclagem): ${d.creditor}`);
  pushUndo(`Dívida removida: ${d.creditor || 'credor por indicar'}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

/** Cria os registos importados de uma folha de cálculo (com histórico e «anular»). */
export async function importSheetRows(caseId: string, entity: ImportEntity, rows: ImportRow[]): Promise<number> {
  if (!rows.length) return 0;
  const n = rows.length;
  const what = n === 1 ? ENTITY_LABELS[entity].one : ENTITY_LABELS[entity].many;
  let ids: string[];
  let kind: 'interessado' | 'patrimonio' | 'passivo';
  if (entity === 'parties') {
    const recs = rows.map((r) => newParty(caseId, r.values as Partial<PartyRecord>));
    if (recs.some((p) => p.isHeadOfEstate)) {
      // Só pode haver um cabeça-de-casal por dossier (a importação já só marca um).
      const current = await db.parties.where('caseId').equals(caseId).filter((p) => p.isHeadOfEstate).count();
      if (current) for (const p of recs) p.isHeadOfEstate = false;
    }
    await db.parties.bulkAdd(recs);
    ids = recs.map((r) => r.id);
    kind = 'interessado';
  } else if (entity === 'assets') {
    const recs = rows.map((r) => newAsset(caseId, r.values as Partial<AssetRecord>));
    await db.assets.bulkAdd(recs);
    ids = recs.map((r) => r.id);
    kind = 'patrimonio';
  } else {
    const recs = rows.map((r) => newDebt(caseId, r.values as Partial<DebtRecord>));
    await db.debts.bulkAdd(recs);
    ids = recs.map((r) => r.id);
    kind = 'passivo';
  }
  await touchCase(caseId);
  await logActivity(caseId, kind, `Importado(s) de uma folha de cálculo: ${n} ${what}`);
  pushUndo(`Importação: ${n} ${what}`, async () => {
    await db.table(entity).bulkDelete(ids);
    await touchCase(caseId);
    await logActivity(caseId, kind, `Anulada a importação de ${n} ${what}`);
  });
  return n;
}

// ---------------- Notas e contactos

export async function addNote(caseId: string, text: string, pinned: boolean): Promise<void> {
  const ts = nowIso();
  const n: NoteRecord = { id: uid(), caseId, text, pinned, createdAt: ts, updatedAt: ts };
  await db.notes.add(n);
  await touchCase(caseId);
  await logActivity(caseId, 'nota', pinned ? 'Nota importante adicionada' : 'Nota adicionada');
}

export async function updateNote(n: NoteRecord, patch: Partial<NoteRecord>): Promise<void> {
  await db.notes.update(n.id, { ...patch, updatedAt: nowIso() });
  await touchCase(n.caseId);
}

export async function deleteNote(n: NoteRecord): Promise<void> {
  const label = n.text.length > 40 ? `${n.text.slice(0, 40)}…` : n.text;
  const entry = await trashRecord('notes', n, label || 'nota');
  await logActivity(n.caseId, 'nota', `Nota removida (na reciclagem): ${label}`);
  pushUndo('Nota removida', () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

export async function addContact(caseId: string, c: Omit<ContactLogRecord, 'id' | 'caseId' | 'createdAt'>): Promise<void> {
  await db.contacts.add({ ...c, id: uid(), caseId, createdAt: nowIso() });
  await touchCase(caseId);
  await logActivity(caseId, 'contacto', `Contacto registado com ${c.person || 'interlocutor'}`);
}

export async function updateContact(c: ContactLogRecord, patch: Partial<ContactLogRecord>): Promise<void> {
  await db.contacts.update(c.id, patch);
  await touchCase(c.caseId);
}

export async function deleteContact(c: ContactLogRecord): Promise<void> {
  const label = `${c.person || 'interlocutor'} (${formatDate(c.date)})`;
  const entry = await trashRecord('contacts', c, label);
  await logActivity(c.caseId, 'contacto', `Contacto removido (na reciclagem): ${label}`);
  pushUndo(`Contacto removido: ${label}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

// ---------------- Agenda

export async function saveEvent(e: EventRecord, isNew: boolean): Promise<void> {
  await db.events.put({ ...e, updatedAt: nowIso() });
  if (e.caseId) {
    await touchCase(e.caseId);
    await logActivity(e.caseId, 'agenda', `${isNew ? 'Evento agendado' : 'Evento atualizado'}: ${e.title} (${formatDate(e.date)}${e.time ? ` ${e.time}` : ''})`);
  }
}

export async function setEventDone(e: EventRecord, done: boolean): Promise<void> {
  await db.events.update(e.id, { done, updatedAt: nowIso() });
  if (e.caseId) await logActivity(e.caseId, 'agenda', `Evento ${done ? 'realizado' : 'reaberto'}: ${e.title}`);
  pushUndo(`Evento ${done ? 'realizado' : 'reaberto'}: ${e.title}`, async () => {
    await db.events.update(e.id, { done: !done, updatedAt: nowIso() });
    if (e.caseId) await logActivity(e.caseId, 'agenda', `Anulado: evento “${e.title}” volta a ${done ? 'por realizar' : 'realizado'}`);
  });
}

export async function deleteEvent(e: EventRecord): Promise<void> {
  const entry = await trashRecord('events', e, e.title);
  if (e.caseId) await logActivity(e.caseId, 'agenda', `Evento removido (na reciclagem): ${e.title}`);
  pushUndo(`Evento removido: ${e.title}`, () => restoreTrash(entry.id).then(() => undefined), 'Fica 30 dias na reciclagem.');
}

// ---------------- Equipa

const PALETTE = ['#2d39b9', '#0b7a5e', '#b4531f', '#8b3fb8', '#c2375b', '#1a6f93', '#6b7a1f', '#a15c00'];

export async function saveMember(m: Partial<MemberRecord> & { name: string }): Promise<MemberRecord> {
  const count = await db.members.count();
  const rec: MemberRecord = {
    id: m.id ?? uid(),
    name: m.name.trim(),
    role: m.role ?? 'Advogada',
    color: m.color ?? PALETTE[count % PALETTE.length]!,
    hourlyRate: typeof m.hourlyRate === 'number' && Number.isFinite(m.hourlyRate) && m.hourlyRate >= 0 ? m.hourlyRate : null,
    createdAt: m.createdAt ?? nowIso(),
  };
  await db.members.put(rec);
  return rec;
}

export async function deleteMember(m: MemberRecord): Promise<void> {
  await db.transaction('rw', [db.members, db.cases, db.tasks], async () => {
    await db.members.delete(m.id);
    await db.cases.where('responsibleId').equals(m.id).modify({ responsibleId: '' });
    await db.tasks.where('assigneeId').equals(m.id).modify({ assigneeId: '' });
  });
}

// ---------------------------------------------------------------------------
// Ações em massa (checklist)

const byCase = (tasks: TaskRecord[]): Map<string, TaskRecord[]> => {
  const m = new Map<string, TaskRecord[]>();
  for (const t of tasks) m.set(t.caseId, [...(m.get(t.caseId) ?? []), t]);
  return m;
};

/** Muda o estado de várias tarefas de uma vez (uma entrada no histórico por dossier). */
export async function bulkSetStatus(tasks: TaskRecord[], status: Status): Promise<number> {
  const changed = tasks.filter((t) => t.status !== status);
  if (!changed.length) return 0;
  const ts = nowIso();
  await db.tasks.bulkUpdate(changed.map((t) => ({ key: t.id, changes: { status, completedAt: status === 'concluido' ? ts : '', updatedAt: ts } })));
  for (const [caseId, list] of byCase(changed)) {
    await touchCase(caseId);
    await logActivity(caseId, 'tarefa', `${list.length} tarefa(s) → ${statusLabel(status)}: ${list.map((t) => `“${t.title}”`).join(', ')}`);
  }
  pushUndo(`${changed.length} tarefa(s) → ${statusLabel(status)}`, async () => {
    const back = nowIso();
    await db.tasks.bulkUpdate(changed.map((t) => ({ key: t.id, changes: { status: t.status, completedAt: t.completedAt, updatedAt: back } })));
    for (const [caseId, list] of byCase(changed)) {
      await touchCase(caseId);
      await logActivity(caseId, 'tarefa', `Anulado: ${list.length} tarefa(s) voltam ao estado anterior`);
    }
  });
  return changed.length;
}

/** Aplica o mesmo patch a várias tarefas (responsável, prazo, criticidade…). */
export async function bulkUpdateTasks(tasks: TaskRecord[], patch: Partial<TaskRecord>, what: string): Promise<number> {
  if (!tasks.length) return 0;
  const ts = nowIso();
  await db.tasks.bulkUpdate(tasks.map((t) => ({ key: t.id, changes: { ...patch, updatedAt: ts } })));
  for (const [caseId, list] of byCase(tasks)) {
    await touchCase(caseId);
    await logActivity(caseId, 'tarefa', `${list.length} tarefa(s): ${what}`);
  }
  const keys = Object.keys(patch) as Array<keyof TaskRecord>;
  pushUndo(`${tasks.length} tarefa(s): ${what}`, async () => {
    const back = nowIso();
    await db.tasks.bulkUpdate(tasks.map((t) => ({ key: t.id, changes: { ...(Object.fromEntries(keys.map((k) => [k, t[k]])) as Partial<TaskRecord>), updatedAt: back } })));
    for (const [caseId, list] of byCase(tasks)) {
      await touchCase(caseId);
      await logActivity(caseId, 'tarefa', `Anulado: ${list.length} tarefa(s) — ${what}`);
    }
  });
  return tasks.length;
}

/** Remove tarefas próprias (as geradas por regras não se apagam — marcam-se N/A). */
export async function deleteManualTasks(tasks: TaskRecord[]): Promise<number> {
  const manual = tasks.filter((t) => !t.ruleKey);
  if (!manual.length) return 0;
  const entries: TrashRecord[] = [];
  for (const t of manual) entries.push(await trashRecord('tasks', t, `“${t.title}”`));
  for (const [caseId, list] of byCase(manual)) {
    await logActivity(caseId, 'tarefa', `${list.length} tarefa(s) própria(s) removida(s) (na reciclagem): ${list.map((t) => `“${t.title}”`).join(', ')}`);
  }
  pushUndo(`${manual.length} tarefa(s) removida(s)`, async () => {
    for (const e of entries) await restoreTrash(e.id);
  }, 'Ficam 30 dias na reciclagem.');
  return manual.length;
}

// ---------------------------------------------------------------------------
// Modelos de dossier

export async function saveCaseTemplate(t: CaseTemplateRecord): Promise<void> {
  await db.caseTemplates.put({ ...t, updatedAt: nowIso() });
}

export async function deleteCaseTemplate(id: string): Promise<void> {
  await db.caseTemplates.delete(id);
}
