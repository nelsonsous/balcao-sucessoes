// Lista de dossiers: filtros avançados, vistas guardadas (com nome), vistas predefinidas,
// sincronização dos filtros com o endereço (partilhável) e pesquisa profunda em notas,
// contactos, documentos, interessados e bens.
import { PHASES, phaseLabel } from '../engine/phases';
import { getSetting, setSetting } from './db';
import type { CaseOverview } from './hooks';
import type { AssetRecord, CaseRecord, CaseStage, ContactLogRecord, DocumentRecord, MemberRecord, NoteRecord, PartyRecord, PhaseId, Priority } from './types';
import { daysFromToday, normalize, nowIso, uid } from './utils';

export type HealthFilter = 'todos' | 'atencao' | 'andamento' | 'concluidos';
export type StageFilter = CaseStage | 'abertos' | 'todos';
export type DueFilter = '' | 'ultrapassado' | '7d' | '30d' | 'sem';
export type DeathFilter = '' | '3m' | '12m' | 'mais1a';
export type IntlFilter = '' | 'sim' | 'nao';

export interface Filters {
  q: string;
  health: HealthFilter;
  stage: StageFilter;
  resp: string;
  priority: '' | Priority;
  tag: string;
  phase: '' | PhaseId;
  due: DueFilter;
  death: DeathFilter;
  intl: IntlFilter;
  /** Pesquisar também em notas, contactos, documentos, interessados e bens. */
  deep: boolean;
}

export const EMPTY_FILTERS: Filters = { q: '', health: 'todos', stage: 'abertos', resp: '', priority: '', tag: '', phase: '', due: '', death: '', intl: '', deep: false };

export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
  createdAt: string;
}

export const STAGE_FILTER_LABELS: Record<StageFilter, string> = {
  abertos: 'Ativos e suspensos',
  ativo: 'Só ativos',
  suspenso: 'Suspensos',
  concluido: 'Concluídos',
  arquivado: 'Arquivados',
  todos: 'Todos',
};
export const HEALTH_LABELS: Record<HealthFilter, string> = { todos: 'Todos', atencao: 'Atenção', andamento: 'Em andamento', concluidos: '100%' };
export const PRIORITY_FILTER_LABELS: Record<Priority, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
export const DUE_LABELS: Record<Exclude<DueFilter, ''>, string> = { ultrapassado: 'Com prazos ultrapassados', '7d': 'Prazo nos próximos 7 dias', '30d': 'Prazo nos próximos 30 dias', sem: 'Sem prazos em aberto' };
export const DEATH_LABELS: Record<Exclude<DeathFilter, ''>, string> = { '3m': 'Óbito nos últimos 3 meses', '12m': 'Óbito nos últimos 12 meses', mais1a: 'Óbito há mais de 1 ano' };
export const INTL_LABELS: Record<Exclude<IntlFilter, ''>, string> = { sim: 'Com elementos internacionais', nao: 'Só nacionais' };

/** Dossier com elementos de estraneidade (óbito, residência, nacionalidade ou bens no estrangeiro). */
export function isInternational(c: CaseRecord): boolean {
  const a = c.answers;
  return a.deathPlace === 'estrangeiro' || (Boolean(a.habitualResidence) && a.habitualResidence !== 'portugal' && a.habitualResidence !== 'desconhecida') || (Boolean(a.nationality) && a.nationality !== 'portuguesa') || a.assets.includes('estrangeiro') || a.foreignCountries.length > 0;
}

/** Texto pesquisável por dossier, além da ficha: notas, contactos, documentos, interessados e bens. */
export type DeepIndex = Map<string, string>;

export function buildDeepIndex(src: { notes: NoteRecord[]; contacts: ContactLogRecord[]; documents: DocumentRecord[]; parties: PartyRecord[]; assets: AssetRecord[] }): DeepIndex {
  const idx: DeepIndex = new Map();
  const add = (caseId: string, text: string) => idx.set(caseId, `${idx.get(caseId) ?? ''} ${normalize(text)}`);
  for (const n of src.notes) add(n.caseId, n.text);
  for (const c of src.contacts) add(c.caseId, `${c.person} ${c.summary} ${c.followUp}`);
  for (const d of src.documents) add(d.caseId, `${d.name} ${d.fileName} ${d.notes}`);
  for (const p of src.parties) add(p.caseId, `${p.name} ${p.nif} ${p.email} ${p.notes}`);
  for (const a of src.assets) add(a.caseId, `${a.description} ${(a as { notes?: string }).notes ?? ''}`);
  return idx;
}

const daysSince = (iso: string, today: Date): number | null => {
  const d = daysFromToday(iso, today);
  return d === null ? null : -d;
};

/** Aplica os filtros a uma lista de dossiers (sem ordenar). */
export function applyFilters(overviews: CaseOverview[], f: Filters, opts: { today?: Date; deep?: DeepIndex } = {}): CaseOverview[] {
  const today = opts.today ?? new Date();
  const n = normalize(f.q);
  return overviews.filter((o) => {
    const c = o.c;
    if (f.stage === 'abertos' ? !(c.stage === 'ativo' || c.stage === 'suspenso') : f.stage !== 'todos' && c.stage !== f.stage) return false;
    if (f.resp && c.responsibleId !== f.resp) return false;
    if (f.health === 'atencao' && o.health.level !== 'vermelho') return false;
    if (f.health === 'andamento' && !(o.health.level === 'laranja' || o.health.level === 'azul')) return false;
    if (f.health === 'concluidos' && o.health.level !== 'verde') return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (f.tag && !c.tags.some((t) => normalize(t) === normalize(f.tag))) return false;
    if (f.phase && o.phase !== f.phase) return false;
    if (f.due) {
      const next = o.nextDeadline ? daysFromToday(o.nextDeadline.dueDate, today) : null;
      if (f.due === 'ultrapassado' && o.blockers.overdue.length === 0) return false;
      if (f.due === '7d' && (next === null || next < 0 || next > 7)) return false;
      if (f.due === '30d' && (next === null || next < 0 || next > 30)) return false;
      if (f.due === 'sem' && o.nextDeadline) return false;
    }
    if (f.death) {
      const since = c.deceased.deathDate ? daysSince(c.deceased.deathDate, today) : null;
      if (since === null) return false;
      if (f.death === '3m' && since > 92) return false;
      if (f.death === '12m' && since > 366) return false;
      if (f.death === 'mais1a' && since <= 366) return false;
    }
    if (f.intl === 'sim' && !isInternational(c)) return false;
    if (f.intl === 'nao' && isInternational(c)) return false;
    if (n) {
      const base = normalize([c.name, c.ref, c.deceased.name, c.client.name, c.tags.join(' ')].join(' '));
      const deep = f.deep ? (opts.deep?.get(c.id) ?? '') : '';
      if (!base.includes(n) && !deep.includes(n)) return false;
    }
    return true;
  });
}

const ADVANCED: Array<keyof Filters> = ['health', 'stage', 'resp', 'priority', 'tag', 'phase', 'due', 'death', 'intl'];

/** Número de filtros avançados ativos (sem contar a pesquisa por texto). */
export function countActive(f: Filters): number {
  return ADVANCED.filter((k) => f[k] !== EMPTY_FILTERS[k]).length;
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return (Object.keys(EMPTY_FILTERS) as Array<keyof Filters>).every((k) => a[k] === b[k]);
}

export interface FilterChip {
  key: keyof Filters;
  label: string;
}

/** Etiquetas dos filtros ativos, para mostrar (e remover) na lista. */
export function describeFilters(f: Filters, members: MemberRecord[] = []): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.stage !== 'abertos') chips.push({ key: 'stage', label: `Situação: ${STAGE_FILTER_LABELS[f.stage]}` });
  if (f.health !== 'todos') chips.push({ key: 'health', label: `Semáforo: ${HEALTH_LABELS[f.health]}` });
  if (f.resp) chips.push({ key: 'resp', label: `Responsável: ${members.find((m) => m.id === f.resp)?.name ?? f.resp}` });
  if (f.priority) chips.push({ key: 'priority', label: `Prioridade: ${PRIORITY_FILTER_LABELS[f.priority]}` });
  if (f.tag) chips.push({ key: 'tag', label: `Etiqueta: ${f.tag}` });
  if (f.phase) chips.push({ key: 'phase', label: `Fase: ${phaseLabel(f.phase)}` });
  if (f.due) chips.push({ key: 'due', label: DUE_LABELS[f.due] });
  if (f.death) chips.push({ key: 'death', label: DEATH_LABELS[f.death] });
  if (f.intl) chips.push({ key: 'intl', label: INTL_LABELS[f.intl] });
  return chips;
}

// ---------------------------------------------------------------------------
// Endereço partilhável: #/dossiers?q=…&prio=urgente&prazo=7d

const PARAM: Record<Exclude<keyof Filters, 'q' | 'deep'>, string> = { health: 'saude', stage: 'situacao', resp: 'resp', priority: 'prio', tag: 'etiqueta', phase: 'fase', due: 'prazo', death: 'obito', intl: 'intl' };
const ALLOWED: Record<Exclude<keyof Filters, 'q' | 'deep' | 'resp' | 'tag'>, readonly string[]> = {
  health: ['todos', 'atencao', 'andamento', 'concluidos'],
  stage: ['abertos', 'ativo', 'suspenso', 'concluido', 'arquivado', 'todos'],
  priority: ['normal', 'alta', 'urgente'],
  phase: PHASES.map((p) => p.id),
  due: ['ultrapassado', '7d', '30d', 'sem'],
  death: ['3m', '12m', 'mais1a'],
  intl: ['sim', 'nao'],
};

export function filtersToSearch(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  for (const k of Object.keys(PARAM) as Array<keyof typeof PARAM>) if (f[k] !== EMPTY_FILTERS[k]) p.set(PARAM[k], String(f[k]));
  if (f.deep) p.set('deep', '1');
  return p.toString();
}

export function filtersFromSearch(search: string): Filters {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const f: Filters = { ...EMPTY_FILTERS };
  f.q = p.get('q') ?? '';
  f.resp = p.get('resp') ?? '';
  f.tag = p.get('etiqueta') ?? '';
  f.deep = p.get('deep') === '1';
  for (const k of Object.keys(ALLOWED) as Array<keyof typeof ALLOWED>) {
    const v = p.get(PARAM[k]);
    if (v && ALLOWED[k].includes(v)) (f as unknown as Record<string, string>)[k] = v;
  }
  return f;
}

// ---------------------------------------------------------------------------
// Vistas predefinidas e guardadas

export const PRESET_VIEWS: Array<{ id: string; name: string; filters: Partial<Filters> }> = [
  { id: 'preset-atrasos', name: 'Com prazos ultrapassados', filters: { due: 'ultrapassado' } },
  { id: 'preset-urgentes', name: 'Urgentes', filters: { priority: 'urgente' } },
  { id: 'preset-7d', name: 'Prazo nos próximos 7 dias', filters: { due: '7d' } },
  { id: 'preset-intl', name: 'Com elementos internacionais', filters: { intl: 'sim' } },
  { id: 'preset-obitos', name: 'Óbitos nos últimos 3 meses', filters: { death: '3m' } },
  { id: 'preset-encerrados', name: 'Concluídos', filters: { stage: 'concluido' } },
];

export const presetFilters = (p: { filters: Partial<Filters> }): Filters => ({ ...EMPTY_FILTERS, ...p.filters });

export async function listViews(): Promise<SavedView[]> {
  return getSetting('savedViews');
}

/** Guarda (ou substitui, se o nome já existir) uma vista com os filtros atuais. */
export async function saveView(name: string, filters: Filters): Promise<SavedView> {
  const clean = name.trim();
  if (!clean) throw new Error('Indique um nome para a vista.');
  const views = await getSetting('savedViews');
  const v: SavedView = { id: uid(), name: clean, filters: { ...filters }, createdAt: nowIso() };
  const next = [...views.filter((x) => normalize(x.name) !== normalize(clean)), v].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  await setSetting('savedViews', next);
  return v;
}

export async function deleteView(id: string): Promise<void> {
  const views = await getSetting('savedViews');
  await setSetting(
    'savedViews',
    views.filter((v) => v.id !== id),
  );
}
