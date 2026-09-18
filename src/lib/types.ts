// Modelo de domínio do Balcão das Sucessões.
// Datas simples em ISO "AAAA-MM-DD"; carimbos temporais em ISO completo.

export type Status = 'pendente' | 'em_curso' | 'aguarda' | 'concluido' | 'na';

export type PhaseId =
  | 'abertura'
  | 'interessados'
  | 'testamento'
  | 'habilitacao'
  | 'internacional'
  | 'patrimonio'
  | 'passivo'
  | 'fiscal'
  | 'partilha'
  | 'encerramento';

export type Tri = 'sim' | 'nao' | 'desconhecido';

export type AssetKind =
  | 'imoveis'
  | 'contas'
  | 'participacoes'
  | 'veiculos'
  | 'aforro'
  | 'estrangeiro'
  | 'outro'
  | 'desconhecido';

/** Respostas do questionário sucessório — a matéria-prima do motor de regras. */
export interface Answers {
  deathPlace: '' | 'portugal' | 'estrangeiro';
  deathCountry: string;
  nationality: '' | 'portuguesa' | 'francesa' | 'outra_ue' | 'outra';
  habitualResidence: '' | 'portugal' | 'franca' | 'outro_ue' | 'fora_ue' | 'desconhecida';
  spouse: '' | 'casado' | 'uniao_facto' | 'nao' | 'desconhecido';
  regime: '' | 'comunhao_adquiridos' | 'comunhao_geral' | 'separacao' | 'desconhecido';
  descendants: '' | Tri;
  descendantsCount: string;
  representation: '' | Tri;
  ascendants: '' | Tri;
  siblings: '' | Tri;
  incapable: '' | Tri;
  /** Separação de pessoas e bens ou divórcio pendente à data do óbito. */
  separated: '' | Tri;
  /** Herdeiros a residir no estrangeiro. */
  heirsAbroad: '' | Tri;
  /** Herdeiros de paradeiro desconhecido. */
  unknownHeirs: '' | Tri;
  others: '' | 'sim' | 'nao' | 'a_confirmar';
  will: '' | Tri;
  gifts: '' | Tri;
  insurance: '' | Tri;
  habilitation: '' | 'necessaria' | 'nao_necessaria' | 'a_confirmar';
  assets: AssetKind[];
  foreignCountries: string[];
  familyHome: '' | Tri;
  liabilities: '' | 'sim' | 'nao' | 'a_confirmar';
  insolvencyRisk: '' | Tri;
  socialSecurity: '' | Tri;
  partition: '' | 'acordo' | 'boas_perspetivas' | 'negociacao' | 'conflito' | 'indeterminado';
}

export interface Deceased {
  name: string;
  nif: string;
  birthDate: string;
  deathDate: string;
  deathCity: string;
  lastAddress: string;
}

export interface ClientInfo {
  name: string;
  email: string;
  phone: string;
  country: string;
  preferred: 'email' | 'telefone' | 'reuniao' | 'outro';
  address: string;
}

export type CaseStage = 'ativo' | 'suspenso' | 'concluido' | 'arquivado';
export type Priority = 'normal' | 'alta' | 'urgente';

export interface CaseRecord {
  id: string;
  ref: string;
  name: string;
  deceased: Deceased;
  client: ClientInfo;
  responsibleId: string;
  priority: Priority;
  stage: CaseStage;
  tags: string[];
  answers: Answers;
  generalNotes: string;
  /** Simulação de quotas guardada (calculadora sucessória), em JSON. */
  calcJson?: string;
  /** Mapa de partilha (atribuição de bens a herdeiros), em JSON. */
  partilhaJson?: string;
  /** Módulo internacional (lei aplicável, CSE, entidades), em JSON. */
  intlJson?: string;
  /** Acordo de honorários (FeesConfig), em JSON. */
  feesJson?: string;
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  caseId: string;
  /** Chave da regra que gerou a tarefa (ausente nas tarefas manuais). */
  ruleKey?: string;
  phase: PhaseId;
  title: string;
  description: string;
  critical: boolean;
  status: Status;
  dueDate: string;
  dueSource: 'regra' | 'manual' | '';
  dueLabel: string;
  legal: string[];
  docs: string[];
  reason: string;
  assigneeId: string;
  notes: string;
  /** A regra deixou de se aplicar mas a tarefa tinha trabalho — fica para revisão. */
  obsolete: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export type PartyRole =
  | 'herdeiro'
  | 'legatario'
  | 'conjuge'
  | 'unido_facto'
  | 'credor'
  | 'beneficiario'
  | 'representante'
  | 'outro'
  | 'a_confirmar';

export type Kinship =
  | ''
  | 'conjuge'
  | 'unido_facto'
  | 'filho'
  | 'neto'
  | 'progenitor'
  | 'avo'
  | 'irmao'
  | 'sobrinho'
  | 'outro_parente'
  | 'sem_parentesco';

export interface PartyRecord {
  id: string;
  caseId: string;
  kind: 'singular' | 'coletiva';
  name: string;
  roles: PartyRole[];
  kinship: Kinship;
  isHeadOfEstate: boolean;
  isClient: boolean;
  isMinor: boolean;
  isIncapacitated: boolean;
  nationality: string;
  birth: string;
  civilStatus: string;
  regime: string;
  nif: string;
  idDoc: string;
  address: string;
  email: string;
  phone: string;
  poa: 'na' | 'a_pedir' | 'pedida' | 'recebida';
  acceptance: 'por_definir' | 'aceitou' | 'repudiou' | 'beneficio_inventario';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetType = 'imoveis' | 'contas' | 'participacoes' | 'veiculos' | 'aforro' | 'outro';

export interface AssetRecord {
  id: string;
  caseId: string;
  type: AssetType;
  description: string;
  holder: string;
  country: string;
  value: number | null;
  valueBasis: '' | 'vpt' | 'saldo' | 'mercado' | 'nominal' | 'estimado';
  ownership: 'proprio' | 'comum' | 'desconhecido';
  share: string;
  matrixArticle: string;
  parish: string;
  registryNumber: string;
  bank: string;
  iban: string;
  company: string;
  nipc: string;
  capitalPct: string;
  plate: string;
  status: 'identificado' | 'documentado' | 'avaliado' | 'partilhado';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtRecord {
  id: string;
  caseId: string;
  creditor: string;
  description: string;
  amount: number | null;
  guarantee: string;
  status: 'por_confirmar' | 'confirmado' | 'pago' | 'contestado';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteRecord {
  id: string;
  caseId: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Channel = 'email' | 'telefone' | 'reuniao' | 'carta' | 'videochamada' | 'outro';

export interface ContactLogRecord {
  id: string;
  caseId: string;
  date: string;
  person: string;
  role: PartyRole;
  channel: Channel;
  summary: string;
  followUp: string;
  followUpDone: boolean;
  createdAt: string;
}

export interface MemberRecord {
  id: string;
  name: string;
  role: string;
  color: string;
  /** Taxa horária própria (€/h); vazio = a do escritório. */
  hourlyRate?: number | null;
  createdAt: string;
}

export interface ActivityRecord {
  id: string;
  caseId: string;
  at: string;
  kind: 'dossier' | 'tarefa' | 'interessado' | 'patrimonio' | 'passivo' | 'nota' | 'contacto' | 'questionario' | 'agenda' | 'documento' | 'honorarios';
  text: string;
  actor: string;
}

export type EventKind = 'reuniao' | 'escritura' | 'prazo' | 'diligencia' | 'lembrete' | 'outro';

/** Evento de agenda: escrituras, reuniões, prazos manuais, diligências. */
export interface EventRecord {
  id: string;
  /** Vazio = evento geral do escritório. */
  caseId: string;
  title: string;
  kind: EventKind;
  date: string;
  /** "HH:MM" — vazio = dia inteiro. */
  time: string;
  endTime: string;
  location: string;
  notes: string;
  assigneeId: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DocStatus = 'em_falta' | 'pedido' | 'recebido' | 'validado' | 'na';

export type DocCategory =
  | 'obito'
  | 'identificacao'
  | 'familia'
  | 'testamento'
  | 'patrimonio'
  | 'bancos'
  | 'fiscal'
  | 'internacional'
  | 'minutas'
  | 'outros';

/** Documento do dossier (checklist documental), com anexo opcional guardado em `files`. */
export interface DocumentRecord {
  id: string;
  caseId: string;
  name: string;
  category: DocCategory;
  status: DocStatus;
  source: 'regra' | 'interessado' | 'manual' | 'minuta' | 'anexo';
  /** Chave normalizada para evitar duplicados na geração automática. */
  key: string;
  partyId: string;
  requestedAt: string;
  receivedAt: string;
  /** Data de emissão (certidões); se vazia, assume-se a data de receção. */
  issuedAt?: string;
  /** Validade em meses (0 = não expira); se ausente, aplica-se a regra pelo nome. */
  validMonths?: number;
  notes: string;
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

/** Conteúdo binário de um anexo (tabela separada para as listas não carregarem ficheiros). */
export interface FileRecord {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export type TemplateLanguage = 'pt' | 'fr' | 'en';

/** Minuta criada pelo escritório (as minutas-base vêm no código). */
export interface TemplateRecord {
  id: string;
  title: string;
  category: string;
  language: TemplateLanguage;
  description: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Tarefa própria guardada num modelo de dossier. */
export interface CustomTaskSeed {
  title: string;
  phase: PhaseId;
  description: string;
  critical: boolean;
}

/** Modelo de dossier: respostas ao questionário + tarefas próprias + etiquetas. */
export interface CaseTemplateRecord {
  id: string;
  name: string;
  description: string;
  answers: Answers;
  tags: string[];
  priority: Priority;
  tasks: CustomTaskSeed[];
  createdAt: string;
  updatedAt: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type TrashTable = 'tasks' | 'parties' | 'assets' | 'debts' | 'notes' | 'contacts' | 'events' | 'documents' | 'timeEntries' | 'expenses' | 'provisions' | 'cases';

/** Item da reciclagem: registo apagado (ou dossier inteiro), reposto ou expirado ao fim de 30 dias. */
export interface TrashRecord {
  id: string;
  caseId: string;
  table: TrashTable;
  recordId: string;
  label: string;
  /** O registo apagado (ou, para dossiers, o pacote com ficha e tabelas). */
  data: unknown;
  /** Anexos apagados juntamente com o registo. */
  files: FileRecord[];
  deletedAt: string;
  deletedBy: string;
}

// ---------------------------------------------------------------------------
// Honorários e despesas

/** Registo de tempo trabalhado num dossier. */
export interface TimeEntryRecord {
  id: string;
  caseId: string;
  /** AAAA-MM-DD */
  date: string;
  minutes: number;
  memberId: string;
  description: string;
  /** Conta para a nota de honorários. */
  billable: boolean;
  /** Taxa própria desta entrada (€/h); vazio = do dossier, da pessoa ou do escritório. */
  rate: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory = 'emolumentos' | 'impostos' | 'custas' | 'certidoes' | 'traducoes' | 'deslocacoes' | 'correio' | 'outros';

/** Despesa suportada pelo escritório por conta do dossier. */
export interface ExpenseRecord {
  id: string;
  caseId: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  /** Valor pago (€). */
  amount: number;
  /** A debitar ao cliente na nota de honorários. */
  billable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Provisão (adiantamento) recebida do cliente. */
export interface ProvisionRecord {
  id: string;
  caseId: string;
  date: string;
  amount: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** Acordo de honorários do dossier (guardado em CaseRecord.feesJson). */
export interface FeesConfig {
  mode: 'horas' | 'fixo';
  /** Honorários fixos acordados (€, sem IVA). */
  fixedFee: number | null;
  /** Taxa horária acordada para este dossier (€/h); vazio = da pessoa ou do escritório. */
  rate: number | null;
  /** Aplicar retenção na fonte de IRS (cliente com contabilidade organizada). */
  withholding: boolean;
  notes: string;
}

/** Cronómetro em curso neste dispositivo. */
export interface ActiveTimer {
  caseId: string;
  startedAt: string;
  description: string;
  memberId: string;
}
