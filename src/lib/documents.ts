// Checklist documental: geração a partir das tarefas e dos interessados, anexos offline.
import { db, logActivity, newDocument, touchCase } from './db';
import { restoreTrash, trashRecord } from './recycle';
import { pushUndo } from './undo';
import type { DocCategory, DocStatus, DocumentRecord, FileRecord, PartyRecord, TaskRecord, TrashRecord } from './types';
import { downloadFile, normalize, nowIso, todayIso, uid } from './utils';
import { validity } from './docValidity';

export const DOC_CATEGORIES: Array<{ id: DocCategory; label: string }> = [
  { id: 'obito', label: 'Óbito e registo civil' },
  { id: 'familia', label: 'Família e filiação' },
  { id: 'identificacao', label: 'Identificação e mandato' },
  { id: 'testamento', label: 'Testamento e liberalidades' },
  { id: 'patrimonio', label: 'Património' },
  { id: 'bancos', label: 'Bancos e dívidas' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'internacional', label: 'Internacional' },
  { id: 'minutas', label: 'Minutas e peças' },
  { id: 'outros', label: 'Outros' },
];

export const DOC_STATUS: Array<{ id: DocStatus; label: string; short: string }> = [
  { id: 'em_falta', label: 'Em falta', short: 'Em falta' },
  { id: 'pedido', label: 'Pedido / a aguardar', short: 'Pedido' },
  { id: 'recebido', label: 'Recebido', short: 'Recebido' },
  { id: 'validado', label: 'Validado', short: 'Validado' },
  { id: 'na', label: 'Não aplicável', short: 'N/A' },
];

const RULES: Array<[RegExp, DocCategory]> = [
  [/estrangeir|apostila|multilingue|tradu[cç]|notaire|certificado sucess/, 'internacional'],
  [/testament|doa[cç][aã]o|doa[cç][oõ]es/, 'testamento'],
  [/saldo|extrato|banco|d[ií]vida|empr[eé]stimo/, 'bancos'],
  [/[oó]bito|funeral/, 'obito'],
  [/nascimento|casamento|conven[cç][aã]o antenupcial|uni[aã]o de facto|acompanhamento|filia[cç]/, 'familia'],
  [/finan[cç]as|rela[cç][aã]o de bens|imposto|irs|imi|nif da heran/, 'fiscal'],
  [/caderneta|predial|matr[ií]cula|dua|autom[oó]vel|pacto|sociedade|balan[cç]o|t[ií]tulo de aquisi|certid[aã]o permanente/, 'patrimonio'],
  [/identifica|nif|procura[cç][aã]o|morada|cart[aã]o|habilita[cç][aã]o|declarantes/, 'identificacao'],
];

export function categorize(name: string): DocCategory {
  const n = normalize(name);
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return 'outros';
}

export const docKey = (name: string, partyId = '') => `${normalize(name)}|${partyId}`;

interface DesiredDoc {
  key: string;
  name: string;
  category: DocCategory;
  source: DocumentRecord['source'];
  partyId: string;
}

/** Documentos genéricos dos herdeiros, substituídos pelos documentos individuais de cada interessado. */
const GENERIC_HEIR_DOCS = /^(documentos? de identificacao( e nif| dos requerentes)?|nif dos herdeiros|certidoes de nascimento( dos descendentes|\/casamento dos herdeiros)?|documentos de identificacao e nif dos ascendentes)$/;

/** Documentos que o escritório obtém ou produz (não se pedem ao cliente). */
const NOT_FROM_CLIENT = /^(pedido de|relacao de bens|certificado sucessorio|declarac(ao|oes) de (saldos|divida)|extratos|habilitacao de herdeiros|identificacao dos declarantes|procuracao forense|certidao permanente|certidao do registo automovel|certidao do testamento|pedido de informacao)/;

export function clientCanProvide(d: Pick<DocumentRecord, 'name' | 'category'>): boolean {
  if (d.category === 'fiscal' || d.category === 'minutas') return false;
  return !NOT_FROM_CLIENT.test(normalize(d.name));
}

const CATEGORY_ORDER = new Map<DocCategory, number>(DOC_CATEGORIES.map((c, i) => [c.id, i]));
export const byCategoryThenName = (a: DocumentRecord, b: DocumentRecord) =>
  (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99) || a.name.localeCompare(b.name, 'pt');

/** Documentos esperados a partir das tarefas (em aberto ou concluídas) e dos interessados. */
export function desiredDocuments(tasks: TaskRecord[], parties: PartyRecord[]): DesiredDoc[] {
  const out = new Map<string, DesiredDoc>();
  const hasHeirParties = parties.some((p) => p.kind === 'singular' && p.name.trim());
  for (const t of tasks) {
    if (t.obsolete || t.status === 'na') continue;
    for (const d of t.docs) {
      if (hasHeirParties && GENERIC_HEIR_DOCS.test(normalize(d))) continue;
      const key = docKey(d);
      if (!out.has(key)) out.set(key, { key, name: d, category: categorize(d), source: 'regra', partyId: '' });
    }
  }
  for (const p of parties) {
    if (p.kind !== 'singular' || !p.name.trim()) continue;
    const heirLike = p.roles.some((r) => r === 'herdeiro' || r === 'conjuge' || r === 'legatario' || r === 'unido_facto');
    if (!heirLike) continue;
    const add = (name: string) => {
      const key = docKey(name, p.id);
      if (!out.has(key)) out.set(key, { key, name, category: categorize(name), source: 'interessado', partyId: p.id });
    };
    add(`Documento de identificação e NIF — ${p.name}`);
    if (p.kinship === 'conjuge') add(`Certidão de casamento — ${p.name}`);
    else if (p.kinship && p.kinship !== 'sem_parentesco') add(`Certidão de nascimento — ${p.name}`);
    if (p.poa !== 'na' && !p.isClient) add(`Procuração — ${p.name}`);
    if (p.isMinor || p.isIncapacitated) add(`Documento do representante legal — ${p.name}`);
  }
  return [...out.values()];
}

/** Acrescenta à checklist os documentos esperados que ainda não existem (nunca remove). */
export async function syncDocuments(caseId: string): Promise<number> {
  const [tasks, parties, existing] = await Promise.all([
    db.tasks.where('caseId').equals(caseId).toArray(),
    db.parties.where('caseId').equals(caseId).toArray(),
    db.documents.where('caseId').equals(caseId).toArray(),
  ]);
  const have = new Set(existing.map((d) => d.key));
  const missing = desiredDocuments(tasks, parties).filter((d) => !have.has(d.key));
  if (missing.length) {
    await db.documents.bulkAdd(missing.map((d) => newDocument(caseId, { ...d })));
    await logActivity(caseId, 'documento', `Checklist documental atualizada: +${missing.length} documento(s)`);
  }
  return missing.length;
}

export async function addDocument(caseId: string, name: string, category?: DocCategory): Promise<DocumentRecord> {
  const doc = newDocument(caseId, { name, category: category ?? categorize(name), key: docKey(name) });
  await db.documents.add(doc);
  await touchCase(caseId);
  return doc;
}

export async function setDocumentStatus(d: DocumentRecord, status: DocStatus): Promise<void> {
  const patch: Partial<DocumentRecord> = { status, updatedAt: nowIso() };
  if (status === 'pedido' && !d.requestedAt) patch.requestedAt = todayIso();
  if ((status === 'recebido' || status === 'validado') && !d.receivedAt) patch.receivedAt = todayIso();
  await db.documents.update(d.id, patch);
  await touchCase(d.caseId);
  await logActivity(d.caseId, 'documento', `Documento “${d.name}”: ${DOC_STATUS.find((s) => s.id === status)?.label}`);
  pushUndo(`Documento “${d.name}” → ${DOC_STATUS.find((s) => s.id === status)?.label}`, async () => {
    await db.documents.update(d.id, { status: d.status, requestedAt: d.requestedAt, receivedAt: d.receivedAt, updatedAt: nowIso() });
    await touchCase(d.caseId);
    await logActivity(d.caseId, 'documento', `Anulado: documento “${d.name}” volta a ${DOC_STATUS.find((s) => s.id === d.status)?.label}`);
  });
}

export async function updateDocument(d: DocumentRecord, patch: Partial<DocumentRecord>): Promise<void> {
  await db.documents.update(d.id, { ...patch, updatedAt: nowIso() });
  await touchCase(d.caseId);
}

export async function deleteDocument(d: DocumentRecord): Promise<void> {
  // Relê o registo: o objeto recebido pode estar desatualizado quanto ao anexo. Vai para a reciclagem com o anexo.
  const current = (await db.documents.get(d.id)) ?? d;
  const entry = await trashRecord('documents', current, current.name);
  await logActivity(d.caseId, 'documento', `Documento removido (na reciclagem): ${current.name}${current.fileId ? ' — com anexo' : ''}`);
  pushUndo(`Documento removido: ${current.name}`, () => restoreTrash(entry.id).then(() => undefined), current.fileId ? 'Fica 30 dias na reciclagem, com o anexo.' : 'Fica 30 dias na reciclagem.');
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Guarda (ou substitui) o anexo de um documento; marca-o como recebido. */
export async function attachFile(d: DocumentRecord, file: File | Blob, name?: string): Promise<void> {
  if (file.size > MAX_FILE_BYTES) throw new Error('O ficheiro excede 25 MB.');
  const fileName = name ?? (file instanceof File ? file.name : 'documento');
  const rec: FileRecord = { id: uid(), blob: file, name: fileName, type: file.type || 'application/octet-stream', size: file.size, createdAt: nowIso() };
  await db.transaction('rw', db.documents, db.files, async () => {
    if (d.fileId) await db.files.delete(d.fileId);
    await db.files.add(rec);
    await db.documents.update(d.id, {
      fileId: rec.id,
      fileName: rec.name,
      fileType: rec.type,
      fileSize: rec.size,
      status: d.status === 'validado' ? 'validado' : 'recebido',
      receivedAt: d.receivedAt || todayIso(),
      updatedAt: nowIso(),
    });
  });
  await touchCase(d.caseId);
  await logActivity(d.caseId, 'documento', `Anexo guardado em “${d.name}”: ${rec.name}`);
}

export async function removeAttachment(d: DocumentRecord): Promise<void> {
  if (!d.fileId) return;
  await db.transaction('rw', db.documents, db.files, async () => {
    await db.files.delete(d.fileId);
    await db.documents.update(d.id, { fileId: '', fileName: '', fileType: '', fileSize: 0, updatedAt: nowIso() });
  });
}

/** Cria um documento a partir de um ficheiro largado no separador. */
export async function documentFromFile(caseId: string, file: File): Promise<DocumentRecord> {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Documento';
  // Um ficheiro largado no dossier é, por definição, um documento já recebido.
  const doc = newDocument(caseId, { name: base, category: categorize(base), source: 'anexo', status: 'recebido', receivedAt: todayIso(), key: docKey(base) + '|' + uid() });
  await db.documents.add(doc);
  await attachFile(doc, file);
  // Devolve o registo já com o anexo (fileId, nome, tamanho) para quem o continuar a usar.
  return (await db.documents.get(doc.id)) ?? doc;
}

export async function openAttachment(d: DocumentRecord, mode: 'view' | 'download'): Promise<boolean> {
  const f = d.fileId ? await db.files.get(d.fileId) : undefined;
  if (!f) return false;
  if (mode === 'download') {
    downloadFile(f.name, f.blob, f.type);
    return true;
  }
  const url = URL.createObjectURL(f.blob);
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  else downloadFile(f.name, f.blob, f.type);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function docStats(docs: DocumentRecord[], today: Date = new Date()) {
  const applicable = docs.filter((d) => d.status !== 'na');
  const done = applicable.filter((d) => d.status === 'recebido' || d.status === 'validado').length;
  const states = applicable.map((d) => validity(d, today).state);
  return {
    total: applicable.length,
    done,
    missing: applicable.filter((d) => d.status === 'em_falta').length,
    requested: applicable.filter((d) => d.status === 'pedido').length,
    expiring: states.filter((s) => s === 'a_expirar').length,
    expired: states.filter((s) => s === 'expirada').length,
    pct: applicable.length ? Math.round((done / applicable.length) * 100) : 0,
  };
}

const byCase = (docs: DocumentRecord[]) => {
  const m = new Map<string, DocumentRecord[]>();
  for (const d of docs) m.set(d.caseId, [...(m.get(d.caseId) ?? []), d]);
  return m;
};

/** Muda o estado de vários documentos de uma vez (datas de pedido/receção preenchidas quando faltam), com «anular». */
export async function bulkSetDocumentStatus(docs: DocumentRecord[], status: DocStatus): Promise<number> {
  const changed = docs.filter((d) => d.status !== status);
  if (!changed.length) return 0;
  const ts = nowIso();
  const today = todayIso();
  const label = DOC_STATUS.find((s) => s.id === status)?.label ?? status;
  await db.documents.bulkUpdate(
    changed.map((d) => ({
      key: d.id,
      changes: {
        status,
        updatedAt: ts,
        ...(status === 'pedido' && !d.requestedAt ? { requestedAt: today } : {}),
        ...((status === 'recebido' || status === 'validado') && !d.receivedAt ? { receivedAt: today } : {}),
      },
    })),
  );
  for (const [caseId, list] of byCase(changed)) {
    await touchCase(caseId);
    await logActivity(caseId, 'documento', `${list.length} documento(s) → ${label}: ${list.map((d) => `“${d.name}”`).join(', ')}`);
  }
  pushUndo(`${changed.length} documento(s) → ${label}`, async () => {
    const back = nowIso();
    await db.documents.bulkUpdate(changed.map((d) => ({ key: d.id, changes: { status: d.status, requestedAt: d.requestedAt, receivedAt: d.receivedAt, updatedAt: back } })));
    for (const [caseId, list] of byCase(changed)) {
      await touchCase(caseId);
      await logActivity(caseId, 'documento', `Anulado: ${list.length} documento(s) voltam ao estado anterior`);
    }
  });
  return changed.length;
}

/** Remove vários documentos para a reciclagem (com anexos), com um único «anular». */
export async function deleteDocuments(docs: DocumentRecord[]): Promise<number> {
  if (!docs.length) return 0;
  const entries: TrashRecord[] = [];
  for (const d of docs) {
    const current = (await db.documents.get(d.id)) ?? d;
    entries.push(await trashRecord('documents', current, current.name));
  }
  for (const [caseId, list] of byCase(docs)) await logActivity(caseId, 'documento', `${list.length} documento(s) removido(s) (na reciclagem): ${list.map((d) => `“${d.name}”`).join(', ')}`);
  pushUndo(`${docs.length} documento(s) removido(s)`, async () => {
    for (const e of entries) await restoreTrash(e.id);
  }, 'Ficam 30 dias na reciclagem, com os anexos.');
  return docs.length;
}

/** Marca os documentos de um pedido como pedidos (data de hoje) e regista o pedido no histórico. */
export async function markRequested(docs: DocumentRecord[], recipient: string): Promise<number> {
  const n = await bulkSetDocumentStatus(docs, 'pedido');
  const caseId = docs[0]?.caseId;
  if (caseId) await logActivity(caseId, 'documento', `Pedido de ${docs.length} documento(s) a ${recipient}`);
  return n;
}
