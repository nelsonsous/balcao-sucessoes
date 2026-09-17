// Paleta de comandos: pesquisa e ordenação de comandos, dossiers, tarefas e minutas.
import { normalize } from './utils';

export type PaletteGroup = 'recentes' | 'navegacao' | 'acoes' | 'dossiers' | 'tarefas' | 'minutas' | 'notas' | 'contactos' | 'documentos';

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  title: string;
  subtitle?: string;
  /** Palavras adicionais pesquisáveis (referência, nome do falecido…). */
  keywords?: string;
  /** Atalho de teclado a mostrar (ex.: "N"). */
  shortcut?: string;
  href?: string;
  run?: () => void | Promise<void>;
}

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  recentes: 'Recentes',
  navegacao: 'Ir para',
  acoes: 'Ações',
  dossiers: 'Dossiers',
  tarefas: 'Tarefas',
  minutas: 'Minutas',
  notas: 'Notas',
  contactos: 'Contactos',
  documentos: 'Documentos',
};

const GROUP_ORDER: PaletteGroup[] = ['recentes', 'navegacao', 'acoes', 'dossiers', 'minutas', 'tarefas', 'documentos', 'notas', 'contactos'];

/** Pontuação de um item para a pesquisa: 0 = não corresponde. */
export function scoreItem(item: PaletteItem, q: string): number {
  const n = normalize(q).trim();
  if (!n) return 1;
  const title = normalize(item.title);
  const hay = normalize(`${item.title} ${item.subtitle ?? ''} ${item.keywords ?? ''}`);
  const words = n.split(/\s+/).filter(Boolean);
  // Correspondência por iniciais ("vg" → "Visão geral", "cs" → "Calculadora sucessória")
  const initials = title
    .split(/[\s—–-]+/)
    .map((w) => w[0] ?? '')
    .join('');
  const byInitials = words.length === 1 && n.length >= 2 && initials.startsWith(n);
  if (!byInitials && !words.every((w) => hay.includes(w))) return 0;
  let score = 10;
  if (title.startsWith(n)) score += 40;
  else if (title.includes(n)) score += 25;
  else if (words.every((w) => title.includes(w))) score += 15;
  if (byInitials) score += 20;
  return score;
}

/** Filtra e ordena: sem pesquisa mostra recentes, navegação e ações; com pesquisa, por pontuação e grupo. */
export function rankItems(items: PaletteItem[], q: string, limit = 16): PaletteItem[] {
  const n = normalize(q).trim();
  if (!n) {
    return items.filter((i) => i.group === 'recentes' || i.group === 'navegacao' || i.group === 'acoes').slice(0, limit);
  }
  const scored = items
    .filter((i) => i.group !== 'recentes')
    .map((i) => ({ i, s: scoreItem(i, q) }))
    .filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.i.group) - GROUP_ORDER.indexOf(b.i.group) || a.i.title.localeCompare(b.i.title, 'pt'));
  return scored.slice(0, limit).map((x) => x.i);
}

const RECENT_KEY = 'bs-palette-recent';

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: string): void {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignora */
  }
}
