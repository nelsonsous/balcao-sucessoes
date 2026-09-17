// Validade das certidões e outros documentos com prazo: as certidões do registo civil e
// predial valem, em regra, 6 meses; o registo criminal, 3. Valores por omissão a confirmar
// caso a caso — o utilizador pode alterar a validade e a data de emissão em cada documento.
import { addMonths } from '../engine/deadlines';
import type { DocumentRecord } from './types';
import { daysFromToday, normalize, parseIsoDate, todayIso } from './utils';

export const VALIDITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Não expira' },
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
  { value: 24, label: '24 meses' },
];

/** Dias antes do fim da validade a partir dos quais se avisa. */
export const EXPIRY_WARNING_DAYS = 30;

/** Validade habitual pelo nome do documento (0 = não expira). */
export function defaultValidMonths(name: string): number {
  const n = normalize(name);
  if (/registo criminal/.test(n)) return 3;
  if (/certidao|certidoes|certificado de obito|certificado sucessorio|certificat de deces|death certificate/.test(n)) return 6;
  return 0;
}

export type ValidityState = 'sem_validade' | 'sem_data' | 'ok' | 'a_expirar' | 'expirada';

export interface Validity {
  state: ValidityState;
  months: number;
  issuedAt: string;
  expiresAt: string;
  daysLeft: number | null;
}

export const VALIDITY_LABELS: Record<ValidityState, string> = {
  sem_validade: 'Sem prazo de validade',
  sem_data: 'Sem data de emissão',
  ok: 'Válida',
  a_expirar: 'A expirar',
  expirada: 'Expirada',
};

type DocLike = Pick<DocumentRecord, 'name' | 'status' | 'receivedAt'> & Partial<Pick<DocumentRecord, 'issuedAt' | 'validMonths'>>;

/** Meses de validade efetivos de um documento (registos antigos sem o campo usam a regra pelo nome). */
export const validMonthsOf = (d: Pick<DocumentRecord, 'name'> & Partial<Pick<DocumentRecord, 'validMonths'>>): number => (typeof d.validMonths === 'number' ? d.validMonths : defaultValidMonths(d.name));

/** Estado de validade: só documentos recebidos/validados expiram; a emissão assume-se na receção se não for indicada. */
export function validity(d: DocLike, today: Date = new Date()): Validity {
  const months = validMonthsOf(d);
  const issuedAt = d.issuedAt || d.receivedAt || '';
  if (!months) return { state: 'sem_validade', months, issuedAt, expiresAt: '', daysLeft: null };
  if (d.status !== 'recebido' && d.status !== 'validado') return { state: 'sem_data', months, issuedAt, expiresAt: '', daysLeft: null };
  const start = parseIsoDate(issuedAt);
  if (!start) return { state: 'sem_data', months, issuedAt, expiresAt: '', daysLeft: null };
  const expiresAt = todayIso(addMonths(start, months));
  const daysLeft = daysFromToday(expiresAt, today) ?? 0;
  return { state: daysLeft < 0 ? 'expirada' : daysLeft <= EXPIRY_WARNING_DAYS ? 'a_expirar' : 'ok', months, issuedAt, expiresAt, daysLeft };
}

/** Texto curto para a lista (null quando não há nada a assinalar). */
export function validityBadge(v: Validity): string | null {
  if (v.state === 'expirada') return `Expirada há ${Math.abs(v.daysLeft ?? 0)} dia(s)`;
  if (v.state === 'a_expirar') return v.daysLeft === 0 ? 'Expira hoje' : `Expira em ${v.daysLeft} dia(s)`;
  return null;
}

/** Documentos a expirar ou expirados (para avisos e filtros). */
export function expiringDocs<T extends DocLike>(docs: T[], today: Date = new Date()): T[] {
  return docs.filter((d) => {
    const s = validity(d, today).state;
    return s === 'a_expirar' || s === 'expirada';
  });
}
