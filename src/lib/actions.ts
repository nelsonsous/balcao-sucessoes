// Operações de escrita. Cada alteração relevante fica no histórico do dossier.
import { phaseLabel, statusLabel } from '../engine/phases';
import { syncCaseTasks, type SyncReport } from '../engine/sync';
import {
  db,
  deleteCaseCascade,
  logActivity,
  newCase,
  newTask,
  nextCaseRef,
  touchCase,
} from './db';
import type {
  AssetRecord,
  CaseRecord,
  ContactLogRecord,
  DebtRecord,
  EventRecord,
  MemberRecord,
  NoteRecord,
  PartyRecord,
  Status,
  TaskRecord,
} from './types';
import { formatDate, nowIso, uid } from './utils';

// ---------------- Dossiers

export async function createCase(data: Partial<CaseRecord>): Promise<{ c: CaseRecord; report: SyncReport }> {
  const c = newCase({ ...data, ref: data.ref || (await nextCaseRef()) });
  await db.cases.add(c);
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
  return syncCaseTasks(next, { log: true });
}

/** Atualiza dados do dossier; se a data do óbito mudar, recalcula prazos. */
export async function saveCaseDetails(c: CaseRecord, patch: Partial<CaseRecord>): Promise<void> {
  const next = { ...c, ...patch, updatedAt: nowIso() };
  await db.cases.put(next);
  await logActivity(c.id, 'dossier', 'Dados do dossier atualizados');
  if (patch.deceased && patch.deceased.deathDate !== c.deceased.deathDate) await syncCaseTasks(next);
}

export async function removeCase(c: CaseRecord): Promise<void> {
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
  await db.tasks.delete(t.id);
  await touchCase(t.caseId);
  await logActivity(t.caseId, 'tarefa', `Tarefa removida: “${t.title}”`);
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
  await db.parties.delete(p.id);
  await touchCase(p.caseId);
  await logActivity(p.caseId, 'interessado', `Interessado removido: ${p.name}`);
}

// ---------------- Património e passivo

export async function saveAsset(a: AssetRecord, isNew: boolean): Promise<void> {
  await db.assets.put({ ...a, updatedAt: nowIso() });
  await touchCase(a.caseId);
  await logActivity(a.caseId, 'patrimonio', `${isNew ? 'Bem adicionado' : 'Bem atualizado'}: ${a.description || 'sem descrição'}`);
}

export async function deleteAsset(a: AssetRecord): Promise<void> {
  await db.assets.delete(a.id);
  await touchCase(a.caseId);
  await logActivity(a.caseId, 'patrimonio', `Bem removido: ${a.description}`);
}

export async function saveDebt(d: DebtRecord, isNew: boolean): Promise<void> {
  await db.debts.put({ ...d, updatedAt: nowIso() });
  await touchCase(d.caseId);
  await logActivity(d.caseId, 'passivo', `${isNew ? 'Dívida adicionada' : 'Dívida atualizada'}: ${d.creditor || 'credor por indicar'}`);
}

export async function deleteDebt(d: DebtRecord): Promise<void> {
  await db.debts.delete(d.id);
  await touchCase(d.caseId);
  await logActivity(d.caseId, 'passivo', `Dívida removida: ${d.creditor}`);
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
  await db.notes.delete(n.id);
  await touchCase(n.caseId);
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
  await db.contacts.delete(c.id);
  await touchCase(c.caseId);
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
}

export async function deleteEvent(e: EventRecord): Promise<void> {
  await db.events.delete(e.id);
  if (e.caseId) await logActivity(e.caseId, 'agenda', `Evento removido: ${e.title}`);
}

// ---------------- Equipa

const PALETTE = ['#2d39b9', '#0e8a6a', '#b4531f', '#8b3fb8', '#c2375b', '#1f7fa8', '#6b7a1f', '#a15c00'];

export async function saveMember(m: Partial<MemberRecord> & { name: string }): Promise<MemberRecord> {
  const count = await db.members.count();
  const rec: MemberRecord = {
    id: m.id ?? uid(),
    name: m.name.trim(),
    role: m.role ?? 'Advogada',
    color: m.color ?? PALETTE[count % PALETTE.length]!,
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
