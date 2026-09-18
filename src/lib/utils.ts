// Utilitários transversais: ids, datas, moeda, texto.

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const nowIso = (): string => new Date().toISOString();

/** Data local de hoje em AAAA-MM-DD (sem desvios de fuso). */
export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Converte "AAAA-MM-DD" numa Date local ao meio-dia (imune a mudanças de hora). */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY = 86_400_000;

/** Dias de calendário entre hoje e a data (negativo = passado). */
export function daysFromToday(iso: string, today: Date = new Date()): number | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const t = parseIsoDate(todayIso(today))!;
  return Math.round((d.getTime() - t.getTime()) / DAY);
}

const fmtShort = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtDateTime = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string, style: 'short' | 'long' | 'daymonth' = 'short'): string {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  if (style === 'long') return fmtLong.format(d);
  if (style === 'daymonth') {
    const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
  }
  return fmtShort.format(d);
}

export function formatDateTime(isoTs: string): string {
  const d = new Date(isoTs);
  return Number.isNaN(d.getTime()) ? '—' : fmtDateTime.format(d);
}

/** "hoje", "amanhã", "daqui a 5 dias", "há 3 dias". */
export function relativeDays(iso: string): string {
  const n = daysFromToday(iso);
  if (n === null) return '';
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n > 0) return n < 60 ? `daqui a ${n} dias` : `daqui a ${Math.round(n / 30)} meses`;
  const a = -n;
  return a < 60 ? `há ${a} dias` : a < 730 ? `há ${Math.round(a / 30)} meses` : `há ${Math.round(a / 365)} anos`;
}

export function timeAgo(isoTs: string): string {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'agora mesmo';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return formatDateTime(isoTs).slice(0, 10);
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const eurCompact = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatEur(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Object.is(v, -0) ? 0 : v;
  return compact ? eurCompact.format(n) : eur.format(n);
}

/** Aceita "1 234,56", "1234.56", "1.234,56 €". */
export function parseAmount(raw: string): number | null {
  const s = (raw ?? '').replace(/[€\s]/g, '');
  if (!s) return null;
  let norm = s;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Minúsculas e sem acentos — para pesquisa tolerante. */
export function normalize(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Plural simples PT-PT: plural(3, 'tarefa', 'tarefas') → "3 tarefas". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 6) return 'Boa noite';
  if (h < 13) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

export function downloadFile(filename: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function maskIban(iban: string): string {
  const s = (iban ?? '').replace(/\s+/g, '');
  if (s.length < 8) return s;
  return `${s.slice(0, 4)} •••• ${s.slice(-4)}`;
}

/** Modo privacidade: "Maria Helena Dupont Silva" → "M. H. D. S." (mantém referências/números). */
export function maskName(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.map((p) => (/^[a-zà-ÿ]{1,3}$/i.test(p) && parts.length > 1 ? p.toLowerCase() : `${p[0]!.toUpperCase()}.`)).join(' ');
}

/** «smooth», exceto quando o sistema pede movimento reduzido. */
export const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
