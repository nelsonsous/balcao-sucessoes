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
  TimeEntryRecord,
  ExpenseRecord,
  ProvisionRecord,
  ActiveTimer,
  OfficeRuleRecord,
  OfficeRuleTask,
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
  timeEntries: EntityTable<TimeEntryRecord, 'id'>;
  expenses: EntityTable<ExpenseRecord, 'id'>;
  provisions: EntityTable<ProvisionRecord, 'id'>;
  officeRules: EntityTable<OfficeRuleRecord, 'id'>;
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

// v6: honorários e despesas (tempo registado, despesas, provisões recebidas).
db.version(6).stores({
  timeEntries: 'id, caseId, date, memberId',
  expenses: 'id, caseId, date',
  provisions: 'id, caseId, date',
});

// v7: regras próprias do escritório (condições sobre o questionário → tarefas).
db.version(7).stores({
  officeRules: 'id, name, updatedAt',
});

export const CASE_TABLES = ['tasks', 'parties', 'assets', 'debts', 'notes', 'contacts', 'activity', 'events', 'documents', 'timeEntries', 'expenses', 'provisions'] as const;

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
  /** Animações: as do sistema ou sempre reduzidas. */
  motion: 'sistema' | 'reduzido';
  /** Contraste: o do sistema ou sempre alto. */
  contrast: 'sistema' | 'alto';
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
  /** Honorários: taxa horária do escritório (€/h, sem IVA). */
  hourlyRate: number;
  /** Taxa de IVA sobre honorários (%). */
  vatRate: number;
  /** Arredondamento do tempo faturável, em minutos (0 = sem arredondamento). */
  timeRounding: number;
  /** Taxa de retenção na fonte de IRS aplicada quando o dossier a pede (%). */
  withholdingRate: number;
  /** Cronómetro em curso neste dispositivo. */
  activeTimer: ActiveTimer | null;
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
  motion: 'sistema',
  contrast: 'sistema',
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
  hourlyRate: 120,
  vatRate: 23,
  timeRounding: 6,
  withholdingRate: 25,
  activeTimer: null,
};

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await db.settings.get(key);
  return (row?.value as AppSettings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await db.settings.put({ key, value });
  if (key === 'theme') applyTheme(value as AppSettings['theme']);
  if (key === 'motion' || key === 'contrast') applyA11y({ [key]: value } as Partial<Pick<AppSettings, 'motion' | 'contrast'>>);
}

/**
 * Preferências de acessibilidade no <html>: classe «reduce-motion» e data-contrast="more".
 * Ficam também no localStorage para o theme-init.js as aplicar antes do primeiro desenho.
 */
export function applyA11y(p: Partial<Pick<AppSettings, 'motion' | 'contrast'>>): void {
  const root = document.documentElement;
  if (p.motion !== undefined) root.classList.toggle('reduce-motion', p.motion === 'reduzido');
  if (p.contrast !== undefined) {
    if (p.contrast === 'alto') root.dataset.contrast = 'more';
    else delete root.dataset.contrast;
  }
  try {
    const cur = JSON.parse(localStorage.getItem('bs-a11y') ?? '{}') as Record<string, string>;
    localStorage.setItem('bs-a11y', JSON.stringify({ ...cur, ...p }));
  } catch {
    /* modo privado: ignora */
  }
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
    [db.cases, db.tasks, db.parties, db.assets, db.debts, db.notes, db.contacts, db.activity, db.events, db.documents, db.timeEntries, db.expenses, db.provisions, db.files, db.trash],
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

export function newTimeEntry(caseId: string, partial: Partial<TimeEntryRecord> = {}): TimeEntryRecord {
  const ts = nowIso();
  return { id: uid(), caseId, date: ts.slice(0, 10), minutes: 0, memberId: '', description: '', billable: true, rate: null, createdAt: ts, updatedAt: ts, ...partial };
}

export function newExpense(caseId: string, partial: Partial<ExpenseRecord> = {}): ExpenseRecord {
  const ts = nowIso();
  return { id: uid(), caseId, date: ts.slice(0, 10), category: 'outros', description: '', amount: 0, billable: true, createdAt: ts, updatedAt: ts, ...partial };
}

export function newProvision(caseId: string, partial: Partial<ProvisionRecord> = {}): ProvisionRecord {
  const ts = nowIso();
  return { id: uid(), caseId, date: ts.slice(0, 10), amount: 0, description: '', createdAt: ts, updatedAt: ts, ...partial };
}

export function newOfficeRuleTask(partial: Partial<OfficeRuleTask> = {}): OfficeRuleTask {
  return { key: uid(), phase: 'abertura', title: '', description: '', critical: false, docs: [], legal: [], ...partial };
}

export function newOfficeRule(partial: Partial<OfficeRuleRecord> = {}): OfficeRuleRecord {
  const ts = nowIso();
  return {
    id: uid(),
    name: '',
    reason: '',
    enabled: true,
    match: 'all',
    conditions: [],
    tasks: [],
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
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
