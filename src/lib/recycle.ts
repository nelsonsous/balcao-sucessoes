// Reciclagem: o que se apaga fica guardado durante 30 dias e pode ser reposto — tarefas,
// interessados, bens, dívidas, notas, contactos, eventos, documentos (com o anexo) e dossiers
// inteiros. A remoção definitiva só acontece ao esvaziar a reciclagem ou por expiração.
import { useLiveQuery } from 'dexie-react-hooks';
import { CASE_TABLES, db, deleteCaseCascade, getSetting, logActivity, touchCase } from './db';
import type { ActivityRecord, CaseRecord, DocumentRecord, FileRecord, TrashRecord, TrashTable } from './types';
import { formatDateTime, nowIso, uid } from './utils';

export const TRASH_RETENTION_DAYS = 30;

export const TRASH_LABELS: Record<TrashTable, string> = {
  tasks: 'Tarefa',
  parties: 'Interessado',
  assets: 'Bem',
  debts: 'Dívida',
  notes: 'Nota',
  contacts: 'Contacto',
  events: 'Evento',
  documents: 'Documento',
  timeEntries: 'Registo de tempo',
  expenses: 'Despesa',
  provisions: 'Provisão',
  cases: 'Dossier',
};

export const TRASH_KIND: Record<TrashTable, ActivityRecord['kind']> = {
  tasks: 'tarefa',
  parties: 'interessado',
  assets: 'patrimonio',
  debts: 'passivo',
  notes: 'nota',
  contacts: 'contacto',
  events: 'agenda',
  documents: 'documento',
  timeEntries: 'honorarios',
  expenses: 'honorarios',
  provisions: 'honorarios',
  cases: 'dossier',
};

/** Pacote guardado quando se elimina um dossier inteiro. */
export interface CaseBundle {
  case: CaseRecord;
  tables: Record<(typeof CASE_TABLES)[number], unknown[]>;
}

const actor = async () => (await getSetting('userName')) || 'Equipa';

/** Move um registo para a reciclagem (com o anexo, se for um documento) e apaga-o da tabela de origem. */
export async function trashRecord(table: Exclude<TrashTable, 'cases'>, rec: { id: string; caseId: string }, label: string): Promise<TrashRecord> {
  const entry: TrashRecord = { id: uid(), caseId: rec.caseId, table, recordId: rec.id, label, data: rec, files: [], deletedAt: nowIso(), deletedBy: await actor() };
  await db.transaction('rw', [db.table(table), db.files, db.trash], async () => {
    const current = ((await db.table(table).get(rec.id)) as typeof rec | undefined) ?? rec;
    entry.data = current;
    const fileId = (current as { fileId?: string }).fileId;
    if (table === 'documents' && fileId) {
      const f = await db.files.get(fileId);
      if (f) {
        entry.files = [f];
        await db.files.delete(fileId);
      }
    }
    await db.table(table).delete(rec.id);
    await db.trash.add(entry);
  });
  if (rec.caseId) await touchCase(rec.caseId);
  return entry;
}

/** Move um dossier inteiro (ficha, tabelas e anexos) para a reciclagem. */
export async function trashCase(c: CaseRecord): Promise<TrashRecord> {
  const current = (await db.cases.get(c.id)) ?? c;
  const tables = {} as CaseBundle['tables'];
  for (const t of CASE_TABLES) tables[t] = await db.table(t).where('caseId').equals(c.id).toArray();
  const fileIds = (tables.documents as DocumentRecord[]).map((d) => d.fileId).filter(Boolean);
  const files = fileIds.length ? (await db.files.bulkGet(fileIds)).filter((f): f is FileRecord => Boolean(f)) : [];
  const entry: TrashRecord = {
    id: uid(),
    caseId: c.id,
    table: 'cases',
    recordId: c.id,
    label: `${current.ref} · ${current.name}`,
    data: { case: current, tables } satisfies CaseBundle,
    files,
    deletedAt: nowIso(),
    deletedBy: await actor(),
  };
  await db.trash.add(entry);
  await deleteCaseCascade(c.id, { keepTrash: true });
  return entry;
}

/** Repõe um item da reciclagem no sítio de origem e regista-o no histórico. */
export async function restoreTrash(id: string): Promise<TrashRecord> {
  const e = await db.trash.get(id);
  if (!e) throw new Error('Este item já não está na reciclagem.');
  if (e.table === 'cases') {
    const b = e.data as CaseBundle;
    await db.transaction('rw', [db.cases, ...CASE_TABLES.map((t) => db.table(t)), db.files, db.trash], async () => {
      await db.cases.put(b.case);
      for (const t of CASE_TABLES) {
        const rows = b.tables[t] ?? [];
        if (rows.length) await db.table(t).bulkPut(rows);
      }
      if (e.files.length) await db.files.bulkPut(e.files);
      await db.trash.delete(id);
    });
    await logActivity(e.caseId, 'dossier', `Dossier reposto da reciclagem (eliminado em ${formatDateTime(e.deletedAt)} por ${e.deletedBy})`);
    return e;
  }
  if (e.caseId && !(await db.cases.get(e.caseId))) throw new Error('O dossier deste item já não existe. Reponha primeiro o dossier.');
  await db.transaction('rw', [db.table(e.table), db.files, db.trash], async () => {
    await db.table(e.table).put(e.data);
    if (e.files.length) await db.files.bulkPut(e.files);
    await db.trash.delete(id);
  });
  if (e.caseId) {
    await touchCase(e.caseId);
    await logActivity(e.caseId, TRASH_KIND[e.table], `Reposto da reciclagem: ${TRASH_LABELS[e.table].toLowerCase()} ${e.label}`);
  }
  return e;
}

/** Apaga definitivamente um item da reciclagem. */
export async function deleteTrash(id: string): Promise<void> {
  await db.trash.delete(id);
}

/** Esvazia a reciclagem (toda, ou só a de um dossier). Devolve quantos itens apagou. */
export async function emptyTrash(caseId?: string): Promise<number> {
  const coll = caseId ? db.trash.where('caseId').equals(caseId) : db.trash.toCollection();
  const n = await coll.count();
  await coll.delete();
  return n;
}

/** Apaga os itens com mais de `days` dias na reciclagem. */
export async function purgeTrash(days = TRASH_RETENTION_DAYS, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return db.trash.where('deletedAt').below(cutoff).delete();
}

/** Itens da reciclagem (do mais recente para o mais antigo). */
export function useTrash(caseId?: string): TrashRecord[] | undefined {
  return useLiveQuery(async () => {
    const rows = caseId ? await db.trash.where('caseId').equals(caseId).toArray() : await db.trash.toArray();
    return rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }, [caseId]);
}

export function useTrashCount(caseId?: string): number {
  return useLiveQuery(() => (caseId ? db.trash.where('caseId').equals(caseId).count() : db.trash.count()), [caseId]) ?? 0;
}

/** Dias que faltam até um item ser apagado automaticamente. */
export function daysLeft(e: Pick<TrashRecord, 'deletedAt'>, now: Date = new Date()): number {
  const expires = new Date(e.deletedAt).getTime() + TRASH_RETENTION_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((expires - now.getTime()) / 86_400_000));
}
