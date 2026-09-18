// Importação a partir de folhas de cálculo: colar do Excel/Numbers/Google Sheets
// (texto separado por tabulações) ou abrir um CSV («;» ou «,»). Deteta as colunas
// pelo cabeçalho, valida (NIF, valores, datas, IBAN, e-mail), assinala repetidos
// — no dossier e na própria folha — e cria os registos com histórico e «anular».
import { checkNif } from './nif';
import { KINSHIP_LABELS, ROLE_LABELS } from './labels';
import type { AssetRecord, AssetType, DebtRecord, Kinship, PartyRecord, PartyRole } from './types';
import { normalize, parseAmount } from './utils';

export type ImportEntity = 'parties' | 'assets' | 'debts';

export const ENTITY_LABELS: Record<ImportEntity, { one: string; many: string }> = {
  parties: { one: 'interessado', many: 'interessados' },
  assets: { one: 'bem', many: 'bens' },
  debts: { one: 'dívida', many: 'dívidas' },
};

// ---------------------------------------------------------------------------
// Leitura da tabela

export interface Table {
  /** Cabeçalho (ou «Coluna N» quando a primeira linha já são dados). */
  header: string[];
  hasHeader: boolean;
  rows: string[][];
  delimiter: '\t' | ';' | ',';
}

/** Conta o separador fora de aspas. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === ch && !q) n += 1;
  }
  return n;
}

export function detectDelimiter(text: string): Table['delimiter'] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  if (lines.some((l) => l.includes('\t'))) return '\t';
  const semi = lines.reduce((s, l) => s + countOutsideQuotes(l, ';'), 0);
  const comma = lines.reduce((s, l) => s + countOutsideQuotes(l, ','), 0);
  return semi >= comma && semi > 0 ? ';' : comma > 0 ? ',' : ';';
}

/** Divide o texto em linhas e células (aspas duplas como no RFC 4180, incluindo quebras de linha dentro de aspas). */
export function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else q = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === '') {
      q = true;
      cell = '';
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

// ---------------------------------------------------------------------------
// Campos por tipo de registo

export interface FieldDef {
  key: string;
  label: string;
  /** Nomes de coluna reconhecidos (sem acentos, minúsculas). */
  synonyms: string[];
  required?: boolean;
}

export const IMPORT_FIELDS: Record<ImportEntity, FieldDef[]> = {
  parties: [
    { key: 'name', label: 'Nome', synonyms: ['nome', 'nome completo', 'interessado', 'herdeiro', 'nome do interessado'], required: true },
    { key: 'nif', label: 'NIF', synonyms: ['nif', 'contribuinte', 'n contribuinte', 'no contribuinte', 'numero de contribuinte', 'numero fiscal', 'nif/nipc'] },
    { key: 'kinship', label: 'Parentesco', synonyms: ['parentesco', 'grau de parentesco', 'relacao', 'relacao com o falecido', 'relacao com o de cujus'] },
    { key: 'roles', label: 'Qualidade', synonyms: ['qualidade', 'papel', 'qualidade sucessoria', 'qualidade na sucessao'] },
    { key: 'isHeadOfEstate', label: 'Cabeça-de-casal', synonyms: ['cabeca de casal', 'cabeca-de-casal', 'cabecadecasal'] },
    { key: 'isMinor', label: 'Menor', synonyms: ['menor', 'menor de idade'] },
    { key: 'birth', label: 'Nascimento', synonyms: ['nascimento', 'data de nascimento', 'data nasc', 'data e local de nascimento', 'nascido em'] },
    { key: 'nationality', label: 'Nacionalidade', synonyms: ['nacionalidade'] },
    { key: 'idDoc', label: 'Documento de identificação', synonyms: ['cc', 'cartao de cidadao', 'documento', 'documento de identificacao', 'bi', 'passaporte', 'doc identificacao'] },
    { key: 'address', label: 'Morada', synonyms: ['morada', 'endereco', 'residencia', 'morada completa'] },
    { key: 'email', label: 'E-mail', synonyms: ['email', 'e-mail', 'correio eletronico', 'mail'] },
    { key: 'phone', label: 'Telefone', synonyms: ['telefone', 'telemovel', 'contacto', 'tel', 'telef', 'contacto telefonico'] },
    { key: 'notes', label: 'Notas', synonyms: ['notas', 'observacoes', 'obs', 'nota'] },
  ],
  assets: [
    { key: 'description', label: 'Descrição', synonyms: ['descricao', 'bem', 'designacao', 'descricao do bem', 'identificacao do bem'], required: true },
    { key: 'type', label: 'Tipo', synonyms: ['tipo', 'categoria', 'natureza', 'tipo de bem'] },
    { key: 'value', label: 'Valor (€)', synonyms: ['valor', 'vpt', 'saldo', 'montante', 'valor patrimonial', 'valor (eur)', 'valor eur', 'valor euros'] },
    { key: 'ownership', label: 'Titularidade', synonyms: ['titularidade', 'bem proprio ou comum', 'proprio/comum', 'natureza do bem'] },
    { key: 'holder', label: 'Titular', synonyms: ['titular', 'titulares', 'em nome de'] },
    { key: 'share', label: 'Quota-parte', synonyms: ['quota-parte', 'quota parte', 'fracao', 'parte', 'percentagem'] },
    { key: 'country', label: 'País', synonyms: ['pais', 'localizacao', 'local'] },
    { key: 'matrixArticle', label: 'Artigo matricial', synonyms: ['artigo', 'artigo matricial', 'matriz', 'art matricial'] },
    { key: 'parish', label: 'Freguesia', synonyms: ['freguesia', 'concelho'] },
    { key: 'registryNumber', label: 'Descrição predial', synonyms: ['descricao predial', 'registo predial', 'n descricao', 'conservatoria', 'descricao na conservatoria'] },
    { key: 'bank', label: 'Banco', synonyms: ['banco', 'instituicao', 'instituicao bancaria'] },
    { key: 'iban', label: 'IBAN / conta', synonyms: ['iban', 'conta', 'n conta', 'numero de conta'] },
    { key: 'company', label: 'Sociedade', synonyms: ['sociedade', 'empresa', 'firma'] },
    { key: 'nipc', label: 'NIPC', synonyms: ['nipc'] },
    { key: 'plate', label: 'Matrícula', synonyms: ['matricula'] },
    { key: 'notes', label: 'Notas', synonyms: ['notas', 'observacoes', 'obs', 'nota'] },
  ],
  debts: [
    { key: 'creditor', label: 'Credor', synonyms: ['credor', 'entidade', 'credora'], required: true },
    { key: 'description', label: 'Descrição', synonyms: ['descricao', 'divida', 'natureza', 'tipo'] },
    { key: 'amount', label: 'Valor (€)', synonyms: ['valor', 'montante', 'em divida', 'valor em divida', 'capital em divida', 'saldo'] },
    { key: 'guarantee', label: 'Garantia', synonyms: ['garantia', 'hipoteca', 'garantias'] },
    { key: 'status', label: 'Estado', synonyms: ['estado', 'situacao'] },
    { key: 'notes', label: 'Notas', synonyms: ['notas', 'observacoes', 'obs', 'nota'] },
  ],
};

const headerKey = (h: string): string =>
  normalize(h)
    .replace(/[º°ª.:()*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Coluna → campo, pelo cabeçalho (cada campo só é usado uma vez). */
export function autoMap(header: string[], entity: ImportEntity): string[] {
  const fields = IMPORT_FIELDS[entity];
  const used = new Set<string>();
  const exact = header.map((h) => {
    const k = headerKey(h);
    const f = fields.find((x) => !used.has(x.key) && (x.synonyms.includes(k) || headerKey(x.label) === k));
    if (f) used.add(f.key);
    return f?.key ?? '';
  });
  // Segunda passagem: cabeçalhos que começam por um sinónimo («Valor patrimonial tributário (€)»).
  return exact.map((m, i) => {
    if (m) return m;
    const k = headerKey(header[i] ?? '');
    const f = fields.find((x) => !used.has(x.key) && x.synonyms.some((s) => s.length >= 3 && k.startsWith(s)));
    if (f) used.add(f.key);
    return f?.key ?? '';
  });
}

/** Lê o texto colado ou do ficheiro: separador, cabeçalho (se a 1.ª linha tiver nomes de colunas conhecidos). */
export function parseTable(text: string, entity: ImportEntity): Table {
  const delimiter = detectDelimiter(text);
  const all = splitRows(text, delimiter);
  const width = Math.max(0, ...all.map((r) => r.length));
  const first = all[0] ?? [];
  const hasHeader = autoMap(first, entity).filter(Boolean).length > 0 && !first.some((c) => /^\d{9}$/.test(c.replace(/\s/g, '')));
  const header = hasHeader ? Array.from({ length: width }, (_, i) => first[i] || `Coluna ${i + 1}`) : Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`);
  const rows = (hasHeader ? all.slice(1) : all).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return { header, hasHeader, rows, delimiter };
}

/** Texto de um ficheiro: UTF-8; se aparecerem caracteres inválidos, tenta Windows-1252 (CSV antigos do Excel). */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}

// ---------------------------------------------------------------------------
// Valores

const TRUE_WORDS = new Set(['sim', 's', 'x', 'yes', 'y', 'true', 'verdadeiro', '1', 'v']);

export const parseBool = (raw: string): boolean => TRUE_WORDS.has(normalize(raw));

const KINSHIP_WORDS: Array<[Exclude<Kinship, ''>, string[]]> = [
  ['unido_facto', ['unido de facto', 'unida de facto', 'uniao de facto', 'companheiro', 'companheira', 'unido(a) de facto']],
  ['conjuge', ['conjuge', 'mulher', 'marido', 'esposa', 'esposo', 'viuva', 'viuvo']],
  ['filho', ['filho', 'filha', 'filhos', 'filho(a)']],
  ['neto', ['neto', 'neta', 'neto(a)']],
  ['progenitor', ['pai', 'mae', 'progenitor', 'progenitora', 'pai / mae']],
  ['avo', ['avo', 'avos', 'avo / avo']],
  ['irmao', ['irmao', 'irma', 'irmao / irma']],
  ['sobrinho', ['sobrinho', 'sobrinha', 'sobrinho(a)']],
  ['outro_parente', ['tio', 'tia', 'primo', 'prima', 'parente', 'outro parente', 'cunhado', 'cunhada', 'bisneto', 'bisneta']],
  ['sem_parentesco', ['sem parentesco', 'nenhum', 'nenhuma', 'amigo', 'amiga', 'terceiro']],
];

export function parseKinship(raw: string): Kinship | null {
  const k = normalize(raw);
  if (!k) return '';
  for (const [value, words] of KINSHIP_WORDS) if (words.includes(k) || normalize(KINSHIP_LABELS[value]) === k) return value;
  return null;
}

const ROLE_WORDS: Array<[PartyRole, string[]]> = [
  ['herdeiro', ['herdeiro', 'herdeira', 'herdeiros', 'herdeiro legitimario', 'herdeiro legitimo', 'herdeiro testamentario']],
  ['legatario', ['legatario', 'legataria']],
  ['conjuge', ['conjuge', 'conjuge sobrevivo']],
  ['unido_facto', ['unido de facto', 'unida de facto']],
  ['credor', ['credor', 'credora']],
  ['beneficiario', ['beneficiario', 'beneficiaria']],
  ['representante', ['representante', 'representante legal', 'tutor', 'tutora', 'acompanhante', 'procurador', 'procuradora']],
  ['outro', ['outro', 'outra', 'outro interessado']],
  ['a_confirmar', ['a confirmar', '?', 'por confirmar']],
];

/** «Herdeiro / Cônjuge» → ['herdeiro', 'conjuge']; devolve os não reconhecidos à parte. */
export function parseRoles(raw: string): { roles: PartyRole[]; unknown: string[] } {
  const parts = raw
    .split(/[/,;+]|\se\s/i)
    .map((x) => normalize(x))
    .filter(Boolean);
  const roles: PartyRole[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const hit = ROLE_WORDS.find(([value, words]) => words.includes(p) || normalize(ROLE_LABELS[value]) === p);
    if (hit) {
      if (!roles.includes(hit[0])) roles.push(hit[0]);
    } else unknown.push(p);
  }
  return { roles, unknown };
}

// Por ordem: o primeiro tipo com uma palavra reconhecida ganha («Quota-parte de prédio» é imóvel; «Ações do Banco X» são participações).
const TYPE_WORDS: Array<[AssetType, string[]]> = [
  ['veiculos', ['veiculo', 'automovel', 'carro', 'viatura', 'mota', 'motociclo', 'barco', 'embarcacao', 'trator', 'ligeiro']],
  ['aforro', ['aforro', 'tesouro', 'certificado']],
  ['imoveis', ['imove', 'predio', 'fracao', 'apartamento', 'moradia', 'vivenda', 'terreno', 'casa', 'loja', 'armazem', 'rustico', 'urbano', 'quinta', 'garagem', 'lote']],
  ['participacoes', ['acoes', 'acao', 'quota', 'participa', 'sociedade', 'empresa', 'titulo', 'fundo', 'obrigac']],
  ['contas', ['conta', 'deposito', 'poupanca', 'banco', 'bancari']],
];

/** Tipo do bem a partir da coluna «Tipo» (ou, sem ela, de palavras da descrição): compara o início de cada palavra. */
export function parseAssetType(raw: string): AssetType | null {
  const words = normalize(raw).split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  for (const [value, stems] of TYPE_WORDS) if (words.some((w) => stems.some((st) => w.startsWith(st)))) return value;
  return null;
}

export function parseOwnership(raw: string): AssetRecord['ownership'] | null {
  const k = normalize(raw).replace(/^bem\s+/, '');
  if (!k) return 'desconhecido';
  if (k.startsWith('propri')) return 'proprio';
  if (k.startsWith('comu')) return 'comum';
  if (k.includes('classific') || k.includes('desconhec')) return 'desconhecido';
  return null;
}

export function parseDebtStatus(raw: string): DebtRecord['status'] | null {
  const k = normalize(raw);
  if (!k) return 'por_confirmar';
  if (k.startsWith('pag') || k.includes('liquidad')) return 'pago';
  if (k.startsWith('confirmad')) return 'confirmado';
  if (k.startsWith('contest')) return 'contestado';
  if (k.includes('confirmar')) return 'por_confirmar';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Datas em «dd/mm/aaaa», «dd-mm-aaaa», «dd.mm.aaaa», «aaaa-mm-dd» ou número de série do Excel
 * → «dd/mm/aaaa». Texto que não é uma data (ex.: «12/03/1950, Lisboa») fica como está.
 */
export function parseDateText(raw: string): { value: string; invalid: boolean } {
  const s = raw.trim();
  if (!s) return { value: '', invalid: false };
  const check = (d: number, m: number, y: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const ok = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1850 && y <= 2100;
    return ok ? { value: `${pad(d)}/${pad(m)}/${y}`, invalid: false } : { value: s, invalid: true };
  };
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return check(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return check(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 80_000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
      return { value: `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`, invalid: false };
    }
  }
  return { value: s, invalid: false };
}

/** Valor em euros: «1.234,56 €», «1234.56», «1 234,56», «(1.000,00)»; devolve null se não for um número. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  const clean = s.replace(/[()]/g, '').replace(/eur(os)?/i, '');
  const t = clean.trim();
  // «1,234.56» (formato inglês): vírgulas de milhares antes de um ponto decimal.
  const english = /^-?\d{1,3}(,\d{3})+(\.\d+)?\s*€?$/.test(t);
  // «1.234» ou «1.234.567» (pontos de milhares, sem cêntimos): em euros, é 1234 e não 1,234.
  const dots = /^-?\d{1,3}(\.\d{3})+\s*€?$/.test(t);
  const n = english ? Number(t.replace(/[€\s,]/g, '')) : dots ? Number(t.replace(/[€\s.]/g, '')) : parseAmount(t);
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export function ibanOk(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// ---------------------------------------------------------------------------
// Linhas → registos

export type ImportValues = Partial<PartyRecord> | Partial<AssetRecord> | Partial<DebtRecord>;

export interface ImportRow {
  /** Número da linha na folha (1 = primeira linha de dados, contando o cabeçalho como 1). */
  line: number;
  values: ImportValues;
  /** Impedem a importação da linha. */
  errors: string[];
  /** A linha importa-se, mas há algo a confirmar (fica também nas notas do registo). */
  warnings: string[];
  /** Repetido: descrição do registo já existente (no dossier ou numa linha anterior). */
  duplicate: string;
}

export interface Existing {
  parties: PartyRecord[];
  assets: AssetRecord[];
  debts: DebtRecord[];
}

const key = (s: string | undefined) => normalize(s ?? '').replace(/[^a-z0-9]/g, '');

function partyKeys(p: Partial<PartyRecord>): string[] {
  const out: string[] = [];
  const nif = (p.nif ?? '').replace(/\s/g, '');
  if (nif) out.push(`nif:${nif}`);
  if (p.name) out.push(`nome:${key(p.name)}`);
  return out;
}

function assetKeys(a: Partial<AssetRecord>): string[] {
  const out: string[] = [];
  if (a.iban) out.push(`iban:${key(a.iban)}`);
  if (a.plate) out.push(`matricula:${key(a.plate)}`);
  if (a.nipc) out.push(`nipc:${key(a.nipc)}`);
  if (a.matrixArticle) out.push(`artigo:${key(a.matrixArticle)}|${key(a.parish)}`);
  if (a.description) out.push(`desc:${a.type ?? ''}|${key(a.description)}`);
  return out;
}

function debtKeys(d: Partial<DebtRecord>): string[] {
  const out: string[] = [];
  if (d.creditor && d.amount !== null && d.amount !== undefined) out.push(`valor:${key(d.creditor)}|${d.amount}`);
  if (d.creditor && d.description) out.push(`desc:${key(d.creditor)}|${key(d.description)}`);
  if (d.creditor && !d.description && (d.amount === null || d.amount === undefined)) out.push(`credor:${key(d.creditor)}`);
  return out;
}

const keysFor = (entity: ImportEntity, v: ImportValues): string[] =>
  entity === 'parties' ? partyKeys(v as Partial<PartyRecord>) : entity === 'assets' ? assetKeys(v as Partial<AssetRecord>) : debtKeys(v as Partial<DebtRecord>);

const labelFor = (entity: ImportEntity, v: ImportValues): string =>
  entity === 'parties' ? ((v as Partial<PartyRecord>).name ?? '') : entity === 'assets' ? ((v as Partial<AssetRecord>).description ?? '') : ((v as Partial<DebtRecord>).creditor ?? '');

/** Valida e converte uma linha. */
function readRow(entity: ImportEntity, cells: Record<string, string>): { values: ImportValues; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: string) => (cells[k] ?? '').trim();
  const notes: string[] = get('notes') ? [get('notes')] : [];
  const keepRaw = (label: string, raw: string, why: string) => {
    warnings.push(`${label} «${raw}» ${why}`);
    notes.push(`${label} indicado na folha: ${raw} (${why})`);
  };

  if (entity === 'parties') {
    const v: Partial<PartyRecord> = {};
    v.name = get('name').replace(/\s+/g, ' ');
    if (!v.name) errors.push('Falta o nome');
    const nif = get('nif').replace(/[\s.-]/g, '');
    if (nif) {
      const c = checkNif(nif);
      if (c.valid) v.nif = nif;
      else keepRaw('NIF', get('nif'), `inválido: ${c.reason.toLowerCase()}`);
    }
    if (get('kinship')) {
      const k = parseKinship(get('kinship'));
      if (k === null) keepRaw('Parentesco', get('kinship'), 'não reconhecido');
      else v.kinship = k;
    }
    if (get('roles')) {
      const r = parseRoles(get('roles'));
      if (r.roles.length) v.roles = r.roles;
      if (r.unknown.length) keepRaw('Qualidade', get('roles'), 'não reconhecida');
    } else if (v.kinship === 'conjuge') v.roles = ['conjuge'];
    else if (v.kinship === 'unido_facto') v.roles = ['unido_facto'];
    if (get('isHeadOfEstate')) v.isHeadOfEstate = parseBool(get('isHeadOfEstate'));
    if (get('isMinor')) v.isMinor = parseBool(get('isMinor'));
    if (get('birth')) {
      const d = parseDateText(get('birth'));
      v.birth = d.value;
      if (d.invalid) warnings.push(`Data de nascimento «${get('birth')}» inválida`);
    }
    if (get('nationality')) v.nationality = get('nationality');
    if (get('idDoc')) v.idDoc = get('idDoc');
    if (get('address')) v.address = get('address').replace(/\s+/g, ' ');
    if (get('email')) {
      if (emailOk(get('email'))) v.email = get('email').toLowerCase();
      else keepRaw('E-mail', get('email'), 'inválido');
    }
    if (get('phone')) v.phone = get('phone');
    if (notes.length) v.notes = notes.join('\n');
    return { values: v, errors, warnings };
  }

  if (entity === 'assets') {
    const v: Partial<AssetRecord> = {};
    v.description = get('description').replace(/\s+/g, ' ');
    if (!v.description) errors.push('Falta a descrição');
    const t = get('type') ? parseAssetType(get('type')) : null;
    if (get('type') && !t) warnings.push(`Tipo «${get('type')}» não reconhecido: fica como «outro»`);
    v.type =
      t ??
      (get('type')
        ? 'outro'
        : get('plate')
          ? 'veiculos'
          : get('iban') || get('bank')
            ? 'contas'
            : get('nipc') || get('company')
              ? 'participacoes'
              : get('matrixArticle') || get('registryNumber')
                ? 'imoveis'
                : (parseAssetType(v.description) ?? 'outro'));
    if (get('value')) {
      const n = parseMoney(get('value'));
      if (n === null) keepRaw('Valor', get('value'), 'não é um número');
      else {
        v.value = n;
        if (n < 0) warnings.push('Valor negativo — confirme (dívidas vão para «Dívidas»)');
      }
    }
    if (get('ownership')) {
      const o = parseOwnership(get('ownership'));
      if (o === null) keepRaw('Titularidade', get('ownership'), 'não reconhecida');
      else v.ownership = o;
    }
    for (const k of ['holder', 'share', 'matrixArticle', 'parish', 'registryNumber', 'bank', 'company', 'plate'] as const) if (get(k)) v[k] = get(k);
    v.country = get('country') || 'Portugal';
    if (get('iban')) {
      const raw = get('iban');
      const compact = raw.replace(/\s+/g, '').toUpperCase();
      v.iban = /^[A-Z]{2}\d{2}/.test(compact) ? compact : raw;
      if (/^[A-Z]{2}\d{2}/.test(compact) && !ibanOk(compact)) warnings.push(`IBAN «${raw}» com dígitos de controlo errados`);
    }
    if (get('nipc')) {
      const c = checkNif(get('nipc').replace(/\s/g, ''));
      if (c.valid) v.nipc = get('nipc').replace(/\s/g, '');
      else keepRaw('NIPC', get('nipc'), `inválido: ${c.reason.toLowerCase()}`);
    }
    if (notes.length) v.notes = notes.join('\n');
    return { values: v, errors, warnings };
  }

  const v: Partial<DebtRecord> = {};
  v.creditor = get('creditor').replace(/\s+/g, ' ');
  if (!v.creditor) errors.push('Falta o credor');
  if (get('description')) v.description = get('description');
  if (get('amount')) {
    const n = parseMoney(get('amount'));
    if (n === null) keepRaw('Valor', get('amount'), 'não é um número');
    else v.amount = Math.abs(n);
  }
  if (get('guarantee')) v.guarantee = get('guarantee');
  if (get('status')) {
    const s = parseDebtStatus(get('status'));
    if (s === null) keepRaw('Estado', get('status'), 'não reconhecido');
    else v.status = s;
  }
  if (notes.length) v.notes = notes.join('\n');
  return { values: v, errors, warnings };
}

/** Converte a tabela com o mapeamento escolhido, valida e assinala repetidos. */
export function buildRows(table: Table, mapping: string[], entity: ImportEntity, existing: Existing): ImportRow[] {
  const seen = new Map<string, string>();
  const current = entity === 'parties' ? existing.parties : entity === 'assets' ? existing.assets : existing.debts;
  for (const r of current) for (const k of keysFor(entity, r)) if (!seen.has(k)) seen.set(k, `já existe no dossier («${labelFor(entity, r)}»)`);
  const offset = table.hasHeader ? 2 : 1;
  let heads = entity === 'parties' ? existing.parties.filter((p) => p.isHeadOfEstate).length : 0;
  return table.rows.map((cells, i) => {
    const byField: Record<string, string> = {};
    mapping.forEach((field, col) => {
      if (field && byField[field] === undefined) byField[field] = cells[col] ?? '';
    });
    const { values, errors, warnings } = readRow(entity, byField);
    if (entity === 'parties' && (values as Partial<PartyRecord>).isHeadOfEstate) {
      if (heads > 0) {
        (values as Partial<PartyRecord>).isHeadOfEstate = false;
        warnings.push('Já há cabeça-de-casal no dossier: a marcação não é importada');
      } else heads += 1;
    }
    const keys = errors.length ? [] : keysFor(entity, values);
    const dup = keys.map((k) => seen.get(k)).find(Boolean) ?? '';
    if (!errors.length) for (const k of keys) if (!seen.has(k)) seen.set(k, `repete a linha ${i + offset}`);
    return { line: i + offset, values, errors, warnings, duplicate: dup };
  });
}

export interface ImportSummary {
  total: number;
  ready: number;
  withWarnings: number;
  errors: number;
  duplicates: number;
}

export function summarize(rows: ImportRow[], includeDuplicates = false): ImportSummary {
  const ok = rows.filter((r) => !r.errors.length);
  const duplicates = ok.filter((r) => r.duplicate).length;
  const ready = ok.filter((r) => includeDuplicates || !r.duplicate);
  return { total: rows.length, ready: ready.length, withWarnings: ready.filter((r) => r.warnings.length).length, errors: rows.length - ok.length, duplicates };
}

/** Linhas que entram na importação. */
export const importable = (rows: ImportRow[], includeDuplicates = false): ImportRow[] => rows.filter((r) => !r.errors.length && (includeDuplicates || !r.duplicate));

/** Cabeçalho de um modelo em branco (para o escritório enviar ao cliente). */
export function templateHeader(entity: ImportEntity): string[] {
  return IMPORT_FIELDS[entity].map((f) => f.label);
}
