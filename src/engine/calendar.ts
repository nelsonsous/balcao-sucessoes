// Calendário português: feriados, dias úteis e férias judiciais.
import { parseIsoDate, todayIso } from '../lib/utils';

export interface Holiday {
  date: string;
  name: string;
  kind: 'nacional' | 'municipal' | 'facultativo';
}

/** Domingo de Páscoa (algoritmo gregoriano anónimo — Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

export function addDaysIso(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return todayIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12));
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Feriados municipais mais comuns (dia/mês). */
export const MUNICIPAL_HOLIDAYS: Record<string, { label: string; day: number; month: number; name: string }> = {
  lisboa: { label: 'Lisboa', day: 13, month: 6, name: 'Santo António (Lisboa)' },
  porto: { label: 'Porto', day: 24, month: 6, name: 'São João (Porto)' },
  braga: { label: 'Braga', day: 24, month: 6, name: 'São João (Braga)' },
  coimbra: { label: 'Coimbra', day: 4, month: 7, name: 'Rainha Santa Isabel (Coimbra)' },
  aveiro: { label: 'Aveiro', day: 12, month: 5, name: 'Santa Joana (Aveiro)' },
  leiria: { label: 'Leiria', day: 22, month: 5, name: 'Dia da Cidade (Leiria)' },
  evora: { label: 'Évora', day: 29, month: 6, name: 'São Pedro (Évora)' },
  funchal: { label: 'Funchal', day: 21, month: 8, name: 'Dia da Cidade (Funchal)' },
  faro: { label: 'Faro', day: 7, month: 9, name: 'Dia da Cidade (Faro)' },
  setubal: { label: 'Setúbal', day: 15, month: 9, name: 'Bocage (Setúbal)' },
  viseu: { label: 'Viseu', day: 21, month: 9, name: 'São Mateus (Viseu)' },
};

/** Resolve a definição de feriado municipal: chave conhecida ou "DD-MM". */
export function resolveMunicipal(setting: string): { day: number; month: number; name: string } | null {
  if (!setting) return null;
  const known = MUNICIPAL_HOLIDAYS[setting];
  if (known) return known;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(setting);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, name: 'Feriado municipal' };
}

export interface HolidayOptions {
  municipal?: { day: number; month: number; name: string } | null;
  /** Carnaval (terça-feira): tolerância de ponto habitual, não obrigatória. */
  includeCarnival?: boolean;
}

export function holidaysForYear(year: number, opts: HolidayOptions = {}): Holiday[] {
  const easter = todayIso(easterSunday(year));
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: 'Ano Novo', kind: 'nacional' },
    { date: addDaysIso(easter, -2), name: 'Sexta-feira Santa', kind: 'nacional' },
    { date: easter, name: 'Páscoa', kind: 'nacional' },
    { date: ymd(year, 4, 25), name: 'Dia da Liberdade', kind: 'nacional' },
    { date: ymd(year, 5, 1), name: 'Dia do Trabalhador', kind: 'nacional' },
    { date: addDaysIso(easter, 60), name: 'Corpo de Deus', kind: 'nacional' },
    { date: ymd(year, 6, 10), name: 'Dia de Portugal', kind: 'nacional' },
    { date: ymd(year, 8, 15), name: 'Assunção de Nossa Senhora', kind: 'nacional' },
    { date: ymd(year, 10, 5), name: 'Implantação da República', kind: 'nacional' },
    { date: ymd(year, 11, 1), name: 'Dia de Todos os Santos', kind: 'nacional' },
    { date: ymd(year, 12, 1), name: 'Restauração da Independência', kind: 'nacional' },
    { date: ymd(year, 12, 8), name: 'Imaculada Conceição', kind: 'nacional' },
    { date: ymd(year, 12, 25), name: 'Natal', kind: 'nacional' },
  ];
  if (opts.includeCarnival !== false) list.push({ date: addDaysIso(easter, -47), name: 'Carnaval', kind: 'facultativo' });
  if (opts.municipal) list.push({ date: ymd(year, opts.municipal.month, opts.municipal.day), name: opts.municipal.name, kind: 'municipal' });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Índice rápido de feriados para um intervalo de anos. */
export class HolidayCalendar {
  private map = new Map<string, Holiday>();
  private years = new Set<number>();
  constructor(private opts: HolidayOptions = {}) {}

  private ensure(year: number) {
    if (this.years.has(year)) return;
    this.years.add(year);
    for (const h of holidaysForYear(year, this.opts)) {
      // Um feriado nacional prevalece sobre um municipal no mesmo dia.
      const cur = this.map.get(h.date);
      if (!cur || (cur.kind !== 'nacional' && h.kind === 'nacional')) this.map.set(h.date, h);
    }
  }

  get(iso: string): Holiday | undefined {
    const y = Number(iso.slice(0, 4));
    if (!Number.isFinite(y)) return undefined;
    this.ensure(y);
    return this.map.get(iso);
  }

  /** Dia útil: não é sábado, domingo nem feriado (nacional ou municipal). */
  isBusinessDay(iso: string): boolean {
    const d = parseIsoDate(iso);
    if (!d) return false;
    const wd = d.getDay();
    if (wd === 0 || wd === 6) return false;
    const h = this.get(iso);
    return !h || h.kind === 'facultativo';
  }

  /** O próprio dia, se útil; caso contrário o primeiro dia útil seguinte. */
  nextBusinessDay(iso: string): string {
    let cur = iso;
    for (let i = 0; i < 15 && !this.isBusinessDay(cur); i++) cur = addDaysIso(cur, 1);
    return cur;
  }

  addBusinessDays(iso: string, n: number): string {
    let cur = iso;
    let left = n;
    while (left > 0) {
      cur = addDaysIso(cur, 1);
      if (this.isBusinessDay(cur)) left -= 1;
    }
    return cur;
  }

  /** Porque é que um dia não é útil (para mostrar ao utilizador). */
  whyNotBusiness(iso: string): string | null {
    const d = parseIsoDate(iso);
    if (!d) return null;
    const h = this.get(iso);
    if (h && h.kind !== 'facultativo') return `feriado (${h.name})`;
    if (d.getDay() === 6) return 'sábado';
    if (d.getDay() === 0) return 'domingo';
    return null;
  }
}

export interface Period {
  start: string;
  end: string;
  name: string;
}

/** Férias judiciais: 22/12–3/1, Domingo de Ramos–Segunda-feira de Páscoa, 16/7–31/8. */
export function judicialHolidayPeriods(year: number): Period[] {
  const easter = todayIso(easterSunday(year));
  return [
    { start: ymd(year - 1, 12, 22), end: ymd(year, 1, 3), name: 'Férias judiciais (Natal)' },
    { start: addDaysIso(easter, -7), end: addDaysIso(easter, 1), name: 'Férias judiciais (Páscoa)' },
    { start: ymd(year, 7, 16), end: ymd(year, 8, 31), name: 'Férias judiciais (verão)' },
    { start: ymd(year, 12, 22), end: ymd(year + 1, 1, 3), name: 'Férias judiciais (Natal)' },
  ];
}

export function judicialHoliday(iso: string): Period | undefined {
  const y = Number(iso.slice(0, 4));
  if (!Number.isFinite(y)) return undefined;
  return judicialHolidayPeriods(y).find((p) => iso >= p.start && iso <= p.end);
}

/** Matriz do mês (semanas de segunda a domingo), sempre com 6 linhas. */
export function monthMatrix(year: number, month0: number): string[][] {
  const first = new Date(year, month0, 1, 12);
  const offset = (first.getDay() + 6) % 7; // segunda = 0
  const start = new Date(year, month0, 1 - offset, 12);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) row.push(todayIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d, 12)));
    weeks.push(row);
  }
  return weeks;
}

export const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function weekdayLong(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'long' }).format(d);
}

/** Segunda-feira da semana da data. */
export function startOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return addDaysIso(iso, -((d.getDay() + 6) % 7));
}
