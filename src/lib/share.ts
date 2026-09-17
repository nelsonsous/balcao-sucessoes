// Partilha de dossier entre colegas: exporta um único dossier (com anexos e,
// opcionalmente, cifrado) e importa-o/junta-o noutro dispositivo com deteção
// de conflitos e registo no histórico. Regra de ouro ao juntar: nada é apagado —
// os registos só são acrescentados ou atualizados.
import { blobToDataUrl, dataUrlToBlob } from './backup';
import { decryptText, encryptText, isEncryptedEnvelope, type EncryptedEnvelope } from './crypto';
import { CASE_TABLES, db, emptyAnswers, emptyClient, emptyDeceased, getSetting, logActivity, newAsset, newCase, newDebt, newDocument, newEvent, newParty, newTask, nextCaseRef } from './db';
import type { ActivityRecord, AssetRecord, CaseRecord, ContactLogRecord, DebtRecord, DocumentRecord, EventRecord, FileRecord, MemberRecord, NoteRecord, PartyRecord, TaskRecord } from './types';
import { downloadFile, formatDateTime, normalize, nowIso, todayIso, uid } from './utils';

export const SHARE_APP = 'balcao-das-sucessoes/dossier';
export const SHARE_VERSION = 1;

export type CaseTable = (typeof CASE_TABLES)[number];

export interface DossierTables {
  tasks: TaskRecord[];
  parties: PartyRecord[];
  assets: AssetRecord[];
  debts: DebtRecord[];
  notes: NoteRecord[];
  contacts: ContactLogRecord[];
  activity: ActivityRecord[];
  events: EventRecord[];
  documents: DocumentRecord[];
}

export interface SerializedFile extends Omit<FileRecord, 'blob'> {
  dataUrl: string;
}

/** Ficheiro de partilha: um dossier completo, autocontido. */
export interface DossierPackage {
  app: typeof SHARE_APP;
  version: number;
  exportedAt: string;
  exportedBy: string;
  includesFiles: boolean;
  case: CaseRecord;
  tables: DossierTables;
  /** Membros da equipa referenciados (responsável, atribuições), para os nomes aparecerem no destino. */
  members: MemberRecord[];
  files: SerializedFile[];
}

export const TABLE_LABELS: Record<CaseTable, string> = {
  tasks: 'Tarefas',
  parties: 'Interessados',
  assets: 'Bens',
  debts: 'Passivo',
  notes: 'Notas',
  contacts: 'Contactos',
  activity: 'Histórico',
  events: 'Agenda',
  documents: 'Documentos',
};

type Row = { id: string; caseId: string } & Record<string, unknown>;
const tablesOf = (t: DossierTables) => t as unknown as Record<CaseTable, Row[]>;

// ---------------------------------------------------------------------------
// Exportação

export async function exportDossier(caseId: string, opts: { includeFiles?: boolean } = {}): Promise<DossierPackage> {
  const c = await db.cases.get(caseId);
  if (!c) throw new Error('Dossier não encontrado.');
  const includeFiles = opts.includeFiles ?? true;
  const tables = {} as DossierTables;
  for (const t of CASE_TABLES) tablesOf(tables)[t] = (await db.table(t).where('caseId').equals(caseId).toArray()) as Row[];
  const memberIds = new Set([c.responsibleId, ...tables.tasks.map((t) => t.assigneeId), ...tables.events.map((e) => e.assigneeId)].filter(Boolean));
  const members = (await db.members.bulkGet([...memberIds])).filter((m): m is MemberRecord => Boolean(m));
  const files: SerializedFile[] = [];
  if (includeFiles) {
    const ids = [...new Set(tables.documents.map((d) => d.fileId).filter(Boolean))];
    for (const f of await db.files.bulkGet(ids)) {
      if (!f) continue;
      const { blob, ...rest } = f;
      files.push({ ...rest, dataUrl: await blobToDataUrl(blob) });
    }
  }
  const exportedBy = (await getSetting('userName')) || 'Equipa';
  return { app: SHARE_APP, version: SHARE_VERSION, exportedAt: nowIso(), exportedBy, includesFiles: includeFiles, case: c, tables, members, files };
}

/** Nome do ficheiro: dossier-<referência>-<data>[.cifrado].json */
export function dossierFileName(c: Pick<CaseRecord, 'ref' | 'name'>, encrypted: boolean, date = todayIso()): string {
  const slug =
    normalize(c.ref || c.name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dossier';
  return `dossier-${slug}-${date}${encrypted ? '.cifrado' : ''}.json`;
}

export interface ShareOptions {
  includeFiles?: boolean;
  /** Com palavra-passe, o ficheiro é cifrado (AES-GCM) e só abre com ela. */
  passphrase?: string;
  hint?: string;
}

/** Descarrega o dossier como ficheiro e regista a exportação no histórico. */
export async function downloadDossier(caseId: string, opts: ShareOptions = {}): Promise<{ name: string; pkg: DossierPackage; bytes: number }> {
  const pkg = await exportDossier(caseId, opts);
  let json = JSON.stringify(pkg);
  if (opts.passphrase) json = JSON.stringify(await encryptText(json, opts.passphrase, opts.hint ? { hint: opts.hint } : {}));
  const name = dossierFileName(pkg.case, Boolean(opts.passphrase));
  downloadFile(name, json, 'application/json');
  await logActivity(caseId, 'dossier', `Dossier exportado para partilha — ${pkg.includesFiles ? `${pkg.files.length} anexo(s)` : 'sem anexos'}${opts.passphrase ? ', cifrado' : ', sem cifra'}`);
  return { name, pkg, bytes: json.length };
}

// ---------------------------------------------------------------------------
// Leitura e validação

/** Lê o texto de um ficheiro de partilha; indica se precisa de palavra-passe. */
export async function readDossierText(text: string, passphrase?: string): Promise<{ pkg: DossierPackage } | { needsPassphrase: true; hint?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O ficheiro não é um JSON válido.');
  }
  if (isEncryptedEnvelope(parsed)) {
    if (!passphrase) return { needsPassphrase: true, ...(parsed.hint ? { hint: parsed.hint } : {}) };
    const plain = await decryptText(parsed as EncryptedEnvelope, passphrase);
    return { pkg: parseDossier(plain) };
  }
  return { pkg: parseDossier(text) };
}

function withDefaults(t: CaseTable, caseId: string, r: Row): Row {
  const base =
    t === 'tasks'
      ? newTask(caseId)
      : t === 'parties'
        ? newParty(caseId)
        : t === 'assets'
          ? newAsset(caseId)
          : t === 'debts'
            ? newDebt(caseId)
            : t === 'documents'
              ? newDocument(caseId)
              : t === 'events'
                ? newEvent({ caseId })
                : null;
  return { ...(base ?? {}), ...r, caseId } as Row;
}

/** Ficha do dossier com todos os campos (registos antigos ou de outra versão podem não os ter todos). */
function normalizeCase(raw: Partial<CaseRecord>): CaseRecord {
  return {
    ...newCase(),
    ...raw,
    id: raw.id ?? '',
    deceased: { ...emptyDeceased(), ...(raw.deceased ?? {}) },
    client: { ...emptyClient(), ...(raw.client ?? {}) },
    answers: { ...emptyAnswers(), ...(raw.answers ?? {}) },
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Valida e normaliza um ficheiro de partilha (preenche campos em falta com valores por omissão). */
interface LoosePackage {
  app?: unknown;
  version?: unknown;
  exportedAt?: unknown;
  exportedBy?: unknown;
  includesFiles?: unknown;
  case?: unknown;
  tables?: unknown;
  members?: unknown;
  files?: unknown;
}

export function parseDossier(text: string): DossierPackage {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O ficheiro não é um JSON válido.');
  }
  const d = (typeof data === 'object' ? data : null) as LoosePackage | null;
  if (d && d.app === 'balcao-das-sucessoes') throw new Error('Este ficheiro é uma cópia de segurança completa: importe-o em Definições → Cópias de segurança.');
  if (!d || d.app !== SHARE_APP || typeof d.case !== 'object' || d.case === null || typeof d.tables !== 'object' || d.tables === null) {
    throw new Error('Este ficheiro não é um dossier partilhado do Balcão das Sucessões.');
  }
  const version = typeof d.version === 'number' ? d.version : 0;
  if (version > SHARE_VERSION) throw new Error('O dossier foi exportado por uma versão mais recente da aplicação. Atualize a aplicação primeiro.');
  const raw = d.case as Partial<CaseRecord>;
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') throw new Error('O dossier no ficheiro está incompleto (sem identificador ou nome).');
  const c = normalizeCase(raw);
  const tablesIn = d.tables as Partial<Record<CaseTable, unknown>>;
  const tables = {} as DossierTables;
  for (const t of CASE_TABLES) {
    const rows = tablesIn[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabela «${TABLE_LABELS[t]}» inválida no ficheiro.`);
    tablesOf(tables)[t] = ((rows ?? []) as Array<Row | null>).filter((r): r is Row => Boolean(r && typeof r === 'object' && typeof r.id === 'string' && r.id)).map((r) => withDefaults(t, c.id, r));
  }
  const members = (Array.isArray(d.members) ? (d.members as unknown[]) : []).filter((m): m is MemberRecord => {
    const x = m as Partial<MemberRecord> | null;
    return Boolean(x && typeof x.id === 'string' && typeof x.name === 'string');
  });
  const files = (Array.isArray(d.files) ? (d.files as unknown[]) : []).filter((f): f is SerializedFile => {
    const x = f as Partial<SerializedFile> | null;
    return Boolean(x && typeof x.id === 'string' && typeof x.dataUrl === 'string');
  });
  return {
    app: SHARE_APP,
    version: version || 1,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : '',
    exportedBy: typeof d.exportedBy === 'string' && d.exportedBy ? d.exportedBy : 'colega',
    includesFiles: Boolean(d.includesFiles),
    case: c,
    tables,
    members,
    files,
  };
}

// ---------------------------------------------------------------------------
// Plano de importação (deteção de conflitos)

export type MergeStrategy = 'recente' | 'ficheiro' | 'local' | 'copia';

export const STRATEGY_LABELS: Record<MergeStrategy, { label: string; description: string }> = {
  recente: { label: 'Manter o mais recente', description: 'Em cada registo ganha a versão alterada mais recentemente (recomendado).' },
  ficheiro: { label: 'Preferir o ficheiro', description: 'As versões do ficheiro substituem as deste dispositivo quando diferem.' },
  local: { label: 'Preferir este dispositivo', description: 'Só acrescenta o que falta; nada do que já existe é alterado.' },
  copia: { label: 'Importar como novo dossier', description: 'Cria um dossier separado, com nova referência, sem tocar no existente.' },
};

export interface TablePlan {
  added: number;
  updated: number;
  kept: number;
  same: number;
}

export interface ImportPlan {
  strategy: MergeStrategy;
  /** O dossier (mesmo identificador) já existe neste dispositivo. */
  exists: boolean;
  local: CaseRecord | null;
  caseState: 'novo' | 'igual' | 'ficheiro_mais_recente' | 'local_mais_recente';
  /** A ficha do dossier (dados, questionário) vai ser substituída pela do ficheiro. */
  caseApplied: boolean;
  tables: Record<CaseTable, TablePlan>;
  totals: TablePlan;
  /** Registos que existem nos dois lados com conteúdo diferente. */
  conflicts: number;
  files: { added: number; existing: number; missing: number };
  members: { added: number };
  /** Outro dossier local com a mesma referência (identificador diferente). */
  refClash: CaseRecord | null;
}

interface Resolution {
  plan: ImportPlan;
  caseRecord: CaseRecord;
  caseAction: 'add' | 'put' | 'keep';
  rows: Record<CaseTable, { add: Row[]; put: Row[] }>;
  files: FileRecord[];
  members: MemberRecord[];
}

const stamp = (r: Row): string => String(r.updatedAt ?? r.createdAt ?? r.at ?? '');

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

/** Cria uma cópia do ficheiro com identificadores novos (dossier, registos e anexos), mantendo as referências cruzadas. */
async function remapAsNew(pkg: DossierPackage): Promise<DossierPackage> {
  const map = new Map<string, string>([[pkg.case.id, uid()]]);
  for (const t of CASE_TABLES) for (const r of tablesOf(pkg.tables)[t]) map.set(r.id, uid());
  for (const f of pkg.files) map.set(f.id, uid());
  let json = JSON.stringify({ case: pkg.case, tables: pkg.tables });
  for (const [from, to] of map) json = json.split(from).join(to);
  const { case: c, tables } = JSON.parse(json) as { case: CaseRecord; tables: DossierTables };
  c.ref = await nextCaseRef();
  return { ...pkg, case: c, tables, files: pkg.files.map((f) => ({ ...f, id: map.get(f.id) ?? f.id })) };
}

async function resolve(input: DossierPackage, strategy: MergeStrategy): Promise<Resolution> {
  const pkg = strategy === 'copia' ? await remapAsNew(input) : input;
  const local = strategy === 'copia' ? undefined : await db.cases.get(pkg.case.id);
  const refClash = local || !pkg.case.ref ? null : ((await db.cases.where('ref').equals(pkg.case.ref).first()) ?? null);

  // Ficha do dossier
  let caseAction: Resolution['caseAction'] = 'add';
  let caseState: ImportPlan['caseState'] = 'novo';
  if (local) {
    if (same(normalizeCase(local), pkg.case)) {
      caseAction = 'keep';
      caseState = 'igual';
    } else {
      const fileNewer = pkg.case.updatedAt > local.updatedAt;
      caseState = fileNewer ? 'ficheiro_mais_recente' : 'local_mais_recente';
      caseAction = strategy === 'ficheiro' || (strategy === 'recente' && fileNewer) ? 'put' : 'keep';
    }
  }

  // Registos, tabela a tabela
  const rows = {} as Resolution['rows'];
  const tables = {} as Record<CaseTable, TablePlan>;
  let conflicts = local && caseState !== 'igual' ? 1 : 0;
  for (const t of CASE_TABLES) {
    const plan: TablePlan = { added: 0, updated: 0, kept: 0, same: 0 };
    const out = { add: [] as Row[], put: [] as Row[] };
    const incoming = tablesOf(pkg.tables)[t];
    const locals = incoming.length ? ((await db.table(t).bulkGet(incoming.map((r) => r.id))) as Array<Row | undefined>) : [];
    incoming.forEach((r, i) => {
      const l = locals[i];
      if (!l) {
        plan.added += 1;
        out.add.push({ ...r });
        return;
      }
      if (same(withDefaults(t, l.caseId, l), r)) {
        plan.same += 1;
        return;
      }
      conflicts += 1;
      const fileNewer = stamp(r) > stamp(l);
      // O histórico é só de acréscimo: uma entrada existente nunca é reescrita.
      const apply = t !== 'activity' && (strategy === 'ficheiro' || (strategy === 'recente' && fileNewer));
      if (apply) {
        plan.updated += 1;
        out.put.push({ ...r });
      } else plan.kept += 1;
    });
    rows[t] = out;
    tables[t] = plan;
  }

  // Anexos: acrescentam-se os que faltam; documentos cujo anexo não vem nem existe ficam sem anexo.
  const files: FileRecord[] = [];
  const filePlan = { added: 0, existing: 0, missing: 0 };
  const available = new Set<string>();
  for (const f of pkg.files) {
    if (await db.files.get(f.id)) filePlan.existing += 1;
    else {
      const { dataUrl, ...rest } = f;
      files.push({ ...rest, blob: dataUrlToBlob(dataUrl) });
      filePlan.added += 1;
    }
    available.add(f.id);
  }
  for (const d of [...rows.documents.add, ...rows.documents.put] as unknown as DocumentRecord[]) {
    if (!d.fileId || available.has(d.fileId) || (await db.files.get(d.fileId))) continue;
    filePlan.missing += 1;
    Object.assign(d, { fileId: '', fileName: '', fileType: '', fileSize: 0 });
  }

  // Membros referenciados que não existem aqui (nunca se altera um membro local).
  const members: MemberRecord[] = [];
  for (const m of pkg.members) if (!(await db.members.get(m.id))) members.push(m);

  const totals = (Object.values(tables) as TablePlan[]).reduce((s, p) => ({ added: s.added + p.added, updated: s.updated + p.updated, kept: s.kept + p.kept, same: s.same + p.same }), { added: 0, updated: 0, kept: 0, same: 0 });
  const plan: ImportPlan = {
    strategy,
    exists: Boolean(local),
    local: local ?? null,
    caseState,
    caseApplied: caseAction === 'put',
    tables,
    totals,
    conflicts,
    files: filePlan,
    members: { added: members.length },
    refClash,
  };
  return { plan, caseRecord: pkg.case, caseAction, rows, files, members };
}

/** Pré-visualização: o que a importação acrescentaria, atualizaria ou manteria. */
export async function planDossierImport(pkg: DossierPackage, strategy: MergeStrategy = 'recente'): Promise<ImportPlan> {
  return (await resolve(pkg, strategy)).plan;
}

// ---------------------------------------------------------------------------
// Importação

export interface ImportResult {
  caseId: string;
  /** Criou um dossier novo neste dispositivo (não existia, ou «importar como novo»). */
  created: boolean;
  strategy: MergeStrategy;
  added: number;
  updated: number;
  kept: number;
  same: number;
  files: number;
  missingFiles: number;
  members: number;
  caseApplied: boolean;
}

/** Importa/junta o dossier segundo a estratégia e regista a operação no histórico. Nada é apagado. */
export async function importDossier(pkg: DossierPackage, strategy: MergeStrategy = 'recente'): Promise<ImportResult> {
  const r = await resolve(pkg, strategy);
  await db.transaction('rw', [db.cases, db.tasks, db.parties, db.assets, db.debts, db.notes, db.contacts, db.activity, db.events, db.documents, db.files, db.members], async () => {
    if (r.members.length) await db.members.bulkAdd(r.members);
    if (r.files.length) await db.files.bulkPut(r.files);
    if (r.caseAction === 'add') await db.cases.add(r.caseRecord);
    else if (r.caseAction === 'put') await db.cases.put(r.caseRecord);
    for (const t of CASE_TABLES) {
      const { add, put } = r.rows[t];
      if (add.length) await db.table(t).bulkAdd(add as never[]);
      if (put.length) await db.table(t).bulkPut(put as never[]);
    }
  });
  const created = r.caseAction === 'add';
  const when = pkg.exportedAt ? ` (exportado em ${formatDateTime(pkg.exportedAt)})` : '';
  const p = r.plan;
  const text = created
    ? `Dossier importado de ${pkg.exportedBy}${when}${strategy === 'copia' ? ' como novo dossier' : ''}: ${p.totals.added} registos${p.files.added ? `, ${p.files.added} anexo(s)` : ''}${p.files.missing ? `, ${p.files.missing} anexo(s) não incluídos no ficheiro` : ''}`
    : `Dossier juntado com a versão de ${pkg.exportedBy}${when}: ${p.totals.added} novos, ${p.totals.updated} atualizados, ${p.totals.kept} mantidos${p.caseApplied ? ', ficha do dossier atualizada' : ''}${p.files.added ? `, ${p.files.added} anexo(s) novos` : ''}${p.files.missing ? `, ${p.files.missing} anexo(s) não incluídos` : ''} — regra: ${STRATEGY_LABELS[strategy].label.toLowerCase()}`;
  await logActivity(r.caseRecord.id, 'dossier', text);
  return {
    caseId: r.caseRecord.id,
    created,
    strategy,
    added: p.totals.added,
    updated: p.totals.updated,
    kept: p.totals.kept,
    same: p.totals.same,
    files: p.files.added,
    missingFiles: p.files.missing,
    members: p.members.added,
    caseApplied: p.caseApplied,
  };
}

/** Frase curta sobre o estado do dossier no destino, para a pré-visualização. */
export function describePlan(plan: ImportPlan): string {
  if (plan.strategy === 'copia') return 'Será criado um dossier novo, com uma nova referência; o que já existe neste dispositivo não é alterado.';
  if (!plan.exists) return `Dossier novo neste dispositivo${plan.refClash ? ` — atenção: já existe outro dossier com a referência ${plan.refClash.ref} (${plan.refClash.name})` : ''}.`;
  const local = plan.local ? ` (alterado aqui em ${formatDateTime(plan.local.updatedAt)})` : '';
  if (plan.caseState === 'igual') return `O dossier já existe neste dispositivo e a ficha é igual${local}; só os registos diferentes serão juntados.`;
  if (plan.caseState === 'ficheiro_mais_recente') return `O dossier já existe neste dispositivo${local}; a ficha do ficheiro é mais recente${plan.caseApplied ? ' e vai substituir a local' : ', mas a local será mantida'}.`;
  return `O dossier já existe neste dispositivo${local}; a ficha local é mais recente${plan.caseApplied ? ', mas será substituída pela do ficheiro' : ' e será mantida'}.`;
}
