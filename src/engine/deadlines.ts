// Cálculo de prazos a partir da data do óbito.
import type { Status } from '../lib/types';
import { daysFromToday, parseIsoDate, todayIso } from '../lib/utils';

export type DeadlineSpec =
  /** Último dia do N.º mês seguinte ao do óbito (ex.: Imposto do Selo). */
  | { kind: 'endOfMonthAfter'; months: number; label: string }
  /** Mesma data, N meses depois (ex.: déclaration de succession em França). */
  | { kind: 'monthsAfter'; months: number; label: string }
  | { kind: 'yearsAfter'; years: number; label: string }
  /** Dia fixo do ano seguinte ao do óbito (ex.: IRS até 30 de junho). */
  | { kind: 'dayOfNextYear'; month: number; day: number; label: string }
  | { kind: 'daysAfter'; days: number; label: string };

export function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), lastDay), 12);
}

/** Devolve a data-limite em AAAA-MM-DD, ou '' se não houver data do óbito. */
export function computeDeadline(spec: DeadlineSpec, deathDate: string): string {
  const d = parseIsoDate(deathDate);
  if (!d) return '';
  switch (spec.kind) {
    case 'endOfMonthAfter':
      return todayIso(new Date(d.getFullYear(), d.getMonth() + spec.months + 1, 0, 12));
    case 'monthsAfter':
      return todayIso(addMonths(d, spec.months));
    case 'yearsAfter':
      return todayIso(addMonths(d, spec.years * 12));
    case 'dayOfNextYear':
      return todayIso(new Date(d.getFullYear() + 1, spec.month - 1, spec.day, 12));
    case 'daysAfter':
      return todayIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + spec.days, 12));
  }
}

export type DueState = 'sem' | 'cumprido' | 'atrasado' | 'hoje' | 'urgente' | 'proximo' | 'futuro';

export function dueState(dueDate: string, status: Status, today: Date = new Date()): DueState {
  if (!dueDate) return 'sem';
  if (status === 'concluido' || status === 'na') return 'cumprido';
  const n = daysFromToday(dueDate, today);
  if (n === null) return 'sem';
  if (n < 0) return 'atrasado';
  if (n === 0) return 'hoje';
  if (n <= 7) return 'urgente';
  if (n <= 30) return 'proximo';
  return 'futuro';
}

export function isWeekend(iso: string): boolean {
  const d = parseIsoDate(iso);
  return !!d && (d.getDay() === 0 || d.getDay() === 6);
}
