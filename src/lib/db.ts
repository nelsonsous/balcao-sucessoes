// Base de dados local (IndexedDB). Os dados nunca saem deste dispositivo
// a não ser por exportação explícita (cópia de segurança).
import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  ActivityRecord,
  Answers,
  AssetRecord,
  CaseRecord,
  CaseTemplateRecord,
  ClientInfo,
  ContactLogRecord,
  DebtRecord,
  Deceased,
  DocumentRecord,
  EventRecord,
  FileRecord,
  MemberRecord,
  NoteRecord,
  PartyRecord,
  SettingRecord,
  TaskRecord,
  TemplateRecord,
  TrashRecord,
} from './types';
import { nowIso, uid } from './utils';
import type { SavedView } from './views';
import { defaultValidMonths } from './docValidity';

export type BalcaoDB = Dexie & {
  cases: EntityTable<CaseRecord, 'id'>;
  tasks: EntityTable<TaskRecord, 'id'>;
  parties: EntityTable<PartyRecord, 'id'>;
  assets: EntityTable<AssetRecord, 'id'>;
  debts: EntityTable<DebtRecord, 'id'>;
  notes: EntityTable<NoteRecord, 'id'>;
  contacts: EntityTable<ContactLogRecord, 'id'>;
  members: EntityTable<MemberRecord, 'id'>;
  activity: EntityTable<ActivityRecord, 'id'>;
  settings: EntityTable<SettingRecord, 'key'>;
  events: EntityTable<EventRecord, 'id'>;
  documents: EntityTable<DocumentRecord, 'id'>;
  files: EntityTable<FileRecord, 'id'>;
  templates: EntityTable<TemplateRecord, 'id'>;
  caseTemplates: EntityTable<CaseTemplateRecord, 'id'>;
  trash: EntityTable<TrashRecord, 'id'>;
};

export const db = new Dexie('balcao-das-sucessoes') as BalcaoDB;

db.version(1).stores({
  cases: 'id, stage, responsibleId, updatedAt, createdAt, ref',
  tasks: 'id, caseId, status, dueDate, assigneeId, ruleKey, phase',
  parties: 'id, caseId',
  assets: 'id, caseId, type',
  debts: 'id, caseId',
  notes: 'id, caseId',
  contacts: 'id, caseId, date, followUp',
  members: 'id',
  activity: 'id, caseId, at',
  settings: 'key',
});

// v2: agenda (escrituras, reuniões, prazos manuais).
db.version(2).stores({
  events: 'id, caseId, date, assigneeId',
});

// v3: documentos, anexos e minutas do escritório.
db.version(3).stores({
  documents: 'id, caseId, status, category, key, fileId',
  files: 'id',
  templates: 'id, category',
});

// v4: modelos de dossier (respostas + tarefas próprias).
db.version(4).stores({
  caseTemplates: 'id, name',
});

// v5: reciclagem (itens apagados, repostos ou expirados ao fim de 30 dias).
db.version(5).stores({
  trash: 'id, caseId, table, deletedAt',
});

export const CASE_TABLES = ['tasks', 'parties', 'assets', 'debts', 'notes', 'contacts', 'activity', 'events', 'documents'] as const;

// ---------------------------------------------------------------------------
// Definições

export interface AppSettings {
  userName: string;
  firmName: string;
  firmCity: string;
  firmAddress: string;
  firmEmail: string;
  firmPhone: string;
  tagline: string;
  theme: 'system' | 'light' | 'dark';
  onboarded: boolean;
  refCounter: number;
  /** Chave de MUNICIPAL_HOLIDAYS, ou "DD-MM" personalizado, ou "" (nenhum). */
  municipalHoliday: string;
  showJudicialHolidays: boolean;
  notifications: boolean;
  appBadge: boolean;
  /** Pessoa da equipa que corresponde a quem usa este dispositivo ("As minhas tarefas"). */
  meId: string;
  /** PIN de bloqueio (PinRecord em JSON) ou "" sem PIN. */
  pinJson: string;
  /** Minutos de inatividade até bloquear (0 = nunca). */
  autoLockMinutes: number;
  /** Bloquear quando a aplicação deixa de estar visível. */
  lockOnHide: boolean;
  /** Modo privacidade: nomes ocultos nas listas e no painel. */
  privacyMode: boolean;
  /** Data/hora da última cópia de segurança exportada. */
  lastBackupAt: string;
  /** Cópias automáticas para uma pasta do dispositivo (File System Access API). */
  autoBackupEnabled: boolean;
  autoBackupEvery: 'alteracao' | 'diaria' | 'semanal';
  autoBackupKeep: number;
  autoBackupFiles: boolean;
  /** Palavra-passe das cópias automáticas (fica só neste dispositivo). */
  autoBackupPass: string;
  /** Nome da pasta escolhida (o handle fica na tabela de definições, chave autoBackupDir). */
  autoBackupDirName: string;
  lastAutoBackupAt: string;
  /** "permissao" quando a pasta precisa de nova autorização; outra mensagem = último erro. */
  autoBackupLastError: string;
  /** Vistas guardadas da lista de dossiers (filtros com nome). */
  savedViews: SavedView[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  firmName: 'Fluencia Advogados',
  firmCity: 'Lisboa',
  firmAddress: '',
  firmEmail: '',
  firmPhone: '',
  tagline: 'Para imprimir Fluencia a cada dossier.',
  theme: 'system',
  onboarded: false,
  refCounter: 0,
  municipalHoliday: '',
  showJudicialHolidays: true,
  notifications: false,
  appBadge: true,
  meId: '',
  pinJson: '',
  autoLockMinutes: 0,
  lockOnHide: false,
  privacyMode: false,
  lastBackupAt: '',
  autoBackupEnabled: false,
  autoBackupEvery: 'diaria',
  autoBackupKeep: 10,
  autoBackupFiles: true,
  autoBackupPass: '',
  autoBackupDirName: '',
  lastAutoBackupAt: '',
  autoBackupLastError: '',
  savedViews: [],
};

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await db.settings.get(key);
  return (row?.value as AppSettings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await db.settings.put({ key, value });
  if (key === 'theme') applyTheme(value as AppSettings['theme']);
}

export function useSettings(): AppSettings {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows ?? []) (out as unknown as Record<string, unknown>)[r.key] = r.value;
  return out;
}

export function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem('bs-theme', theme);
  } catch {
    /* modo privado: ignora */
  }
}

/** Referência interna sequencial por ano: BS-2026-001. */
export async function nextCaseRef(): Promise<string> {
  const n = (await getSetting('refCounter')) + 1;
  await setSetting('refCounter', n);
  return `BS-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Fábricas com valores por omissão

export function emptyAnswers(): Answers {
  return {
    deathPlace: '',
    deathCountry: '',
    nationality: '',
    habitualResidence: '',
    spouse: '',
    regime: '',
    descendants: '',
    descendantsCount: '',
    representation: '',
    ascendants: '',
    siblings: '',
    incapable: '',
    separated: '',
    heirsAbroad: '',
    unknownHeirs: '',
    others: '',
    will: '',
    gifts: '',
    insurance: '',
    habilitation: '',
    assets: [],
    foreignCountries: [],
    familyHome: '',
    liabilities: '',
    insolvencyRisk: '',
    socialSecurity: '',
    partition: '',
  };
}

export function emptyDeceased(): Deceased {
  return { name: '', nif: '', birthDate: '', deathDate: '', deathCity: '', lastAddress: '' };
}

export function emptyClient(): ClientInfo {
  return { name: '', email: '', phone: '', country: 'Portugal', preferred: 'email', address: '' };
}

export function newCase(partial: Partial<CaseRecord> = {}): CaseRecord {
  const ts = nowIso();
  return {
    id: uid(),
    ref: '',
    name: '',
    deceased: emptyDeceased(),
    client: emptyClient(),
    responsibleId: '',
    priority: 'normal',
    stage: 'ativo',
    tags: [],
    answers: emptyAnswers(),
    generalNotes: '',
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function newTask(caseId: string, partial: Partial<TaskRecord> = {}): TaskRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId,
    phase: 'abertura',
    title: '',
    description: '',
    critical: false,
    status: 'pendente',
    dueDate: '',
    dueSource: '',
    dueLabel: '',
    legal: [],
    docs: [],
    reason: '',
    assigneeId: '',
    notes: '',
    obsolete: false,
    order: 9999,
    createdAt: ts,
    updatedAt: ts,
    completedAt: '',
    ...partial,
  };
}

export function newEvent(partial: Partial<EventRecord> = {}): EventRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId: '',
    title: '',
    kind: 'reuniao',
    date: '',
    time: '',
    endTime: '',
    location: '',
    notes: '',
    assigneeId: '',
    done: false,
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function newDocument(caseId: string, partial: Partial<DocumentRecord> = {}): DocumentRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId,
    name: '',
    category: 'outros',
    status: 'em_falta',
    source: 'manual',
    key: '',
    partyId: '',
    requestedAt: '',
    receivedAt: '',
    issuedAt: '',
    validMonths: defaultValidMonths(partial.name ?? ''),
    notes: '',
    fileId: '',
    fileName: '',
    fileType: '',
    fileSize: 0,
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function newParty(caseId: string, partial: Partial<PartyRecord> = {}): PartyRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId,
    kind: 'singular',
    name: '',
    roles: ['a_confirmar'],
    kinship: '',
    isHeadOfEstate: false,
    isClient: false,
    isMinor: false,
    isIncapacitated: false,
    nationality: '',
    birth: '',
    civilStatus: '',
    regime: '',
    nif: '',
    idDoc: '',
    address: '',
    email: '',
    phone: '',
    poa: 'na',
    acceptance: 'por_definir',
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function newAsset(caseId: string, partial: Partial<AssetRecord> = {}): AssetRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId,
    type: 'imoveis',
    description: '',
    holder: '',
    country: 'Portugal',
    value: null,
    valueBasis: '',
    ownership: 'desconhecido',
    share: '',
    matrixArticle: '',
    parish: '',
    registryNumber: '',
    bank: '',
    iban: '',
    company: '',
    nipc: '',
    capitalPct: '',
    plate: '',
    status: 'identificado',
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

export function newDebt(caseId: string, partial: Partial<DebtRecord> = {}): DebtRecord {
  const ts = nowIso();
  return {
    id: uid(),
    caseId,
    creditor: '',
    description: '',
    amount: null,
    guarantee: '',
    status: 'por_confirmar',
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Operações

export async function logActivity(
  caseId: string,
  kind: ActivityRecord['kind'],
  text: string,
): Promise<void> {
  const actor = (await getSetting('userName')) || 'Equipa';
  await db.activity.add({ id: uid(), caseId, at: nowIso(), kind, text, actor });
}

export async function touchCase(caseId: string): Promise<void> {
  await db.cases.update(caseId, { updatedAt: nowIso() });
}

/** Apaga um dossier e tudo o que lhe pertence. `keepTrash` mantém os itens dele que já estavam na reciclagem. */
export async function deleteCaseCascade(caseId: string, opts: { keepTrash?: boolean } = {}): Promise<void> {
  await db.transaction(
    'rw',
    [db.cases, db.tasks, db.parties, db.assets, db.debts, db.notes, db.contacts, db.activity, db.events, db.documents, db.files, db.trash],
    async () => {
      const fileIds = (await db.documents.where('caseId').equals(caseId).toArray()).map((d) => d.fileId).filter(Boolean);
      if (fileIds.length) await db.files.bulkDelete(fileIds);
      for (const t of CASE_TABLES) await db.table(t).where('caseId').equals(caseId).delete();
      if (!opts.keepTrash) await db.trash.where('caseId').equals(caseId).delete();
      await db.cases.delete(caseId);
    },
  );
}

/** Pede ao navegador que não apague os dados em caso de pouco espaço. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function newCaseTemplate(partial: Partial<CaseTemplateRecord> = {}): CaseTemplateRecord {
  const ts = nowIso();
  return {
    id: uid(),
    name: '',
    description: '',
    answers: emptyAnswers(),
    tags: [],
    priority: 'normal',
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}
