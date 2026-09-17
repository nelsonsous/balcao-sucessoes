// Contagem de prazos: dias corridos, dias úteis, meses e anos, com as regras do
// Código Civil (art. 279.º) e do Código de Processo Civil (art. 138.º: prazos
// processuais contínuos, suspensos nas férias judiciais). Conteúdo de apoio.
import { addDaysIso, judicialHoliday, type HolidayCalendar, type Period } from './calendar';
import { addMonths } from './deadlines';
import { formatDate, parseIsoDate, todayIso } from '../lib/utils';

export type CountUnit = 'dias' | 'dias_uteis' | 'meses' | 'anos';

export interface CountSpec {
  /** Data do facto (dies a quo) — o próprio dia não conta (art. 279.º, al. b) CC). */
  start: string;
  count: number;
  unit: CountUnit;
  /** Prazo processual: suspende-se nas férias judiciais (art. 138.º, n.º 1 CPC). */
  judicial?: boolean;
  /** Se o termo cair em dia não útil, transfere-se para o 1.º dia útil seguinte (art. 279.º, al. e) CC; art. 138.º, n.º 2 CPC). */
  moveToBusinessDay?: boolean;
}

export interface CountResult {
  /** Termo calculado antes do ajuste ao dia útil. */
  end: string;
  /** Termo final (após ajuste ao 1.º dia útil seguinte, quando aplicável). */
  final: string;
  /** Períodos de férias judiciais que suspenderam a contagem. */
  suspended: Period[];
  /** Explicação passo a passo. */
  steps: string[];
  /** Base legal resumida. */
  legal: string[];
  valid: boolean;
}

export const UNIT_LABELS: Record<CountUnit, string> = { dias: 'dias corridos', dias_uteis: 'dias úteis', meses: 'meses', anos: 'anos' };

/** Conta um prazo a partir de uma data, devolvendo o termo e a explicação. */
export function countDeadline(spec: CountSpec, calendar: HolidayCalendar): CountResult {
  const d = parseIsoDate(spec.start);
  if (!d || !Number.isFinite(spec.count) || spec.count <= 0) {
    return { end: '', final: '', suspended: [], steps: ['Indique a data de início e um número de dias, meses ou anos maior do que zero.'], legal: [], valid: false };
  }
  const steps: string[] = [];
  const legal: string[] = [];
  const suspended: Period[] = [];
  let end = '';
  const startLabel = formatDate(spec.start, 'long');

  if (spec.unit === 'meses' || spec.unit === 'anos') {
    const months = spec.unit === 'meses' ? spec.count : spec.count * 12;
    end = todayIso(addMonths(d, months));
    steps.push(`${spec.count} ${UNIT_LABELS[spec.unit]} a contar de ${startLabel}: termina no dia correspondente, ${formatDate(end, 'long')}${addMonths(d, months).getDate() !== d.getDate() ? ' (o mês de destino não tem esse dia: conta-se o último dia do mês)' : ''}.`);
    legal.push('Código Civil, art. 279.º, al. c)');
  } else if (spec.unit === 'dias_uteis') {
    end = calendar.addBusinessDays(spec.start, spec.count);
    steps.push(`O dia do facto (${startLabel}) não conta; contam-se ${spec.count} dias úteis, saltando sábados, domingos e feriados.`);
    legal.push('Código Civil, art. 279.º, al. b)');
    if (spec.judicial) {
      // Dias úteis + suspensão: recontar saltando também as férias judiciais.
      let cur = spec.start;
      let left = spec.count;
      while (left > 0) {
        cur = addDaysIso(cur, 1);
        const jh = judicialHoliday(cur);
        if (jh) {
          if (!suspended.some((p) => p.start === jh.start)) suspended.push(jh);
          continue;
        }
        if (calendar.isBusinessDay(cur)) left -= 1;
      }
      end = cur;
      legal.push('Código de Processo Civil, art. 138.º, n.º 1');
    }
  } else {
    // dias corridos: o dia do facto não conta; o prazo termina às 24 h do último dia
    let cur = spec.start;
    let left = spec.count;
    while (left > 0) {
      cur = addDaysIso(cur, 1);
      if (spec.judicial) {
        const jh = judicialHoliday(cur);
        if (jh) {
          if (!suspended.some((p) => p.start === jh.start)) suspended.push(jh);
          continue;
        }
      }
      left -= 1;
    }
    end = cur;
    steps.push(`O dia do facto (${startLabel}) não conta; o prazo de ${spec.count} dias corridos termina às 24 h do último dia, ${formatDate(end, 'long')}.`);
    legal.push('Código Civil, art. 279.º, als. b) e c)');
    if (spec.judicial) legal.push('Código de Processo Civil, art. 138.º, n.º 1');
  }

  for (const p of suspended) steps.push(`Contagem suspensa durante as ${p.name.toLowerCase()} (${formatDate(p.start)} a ${formatDate(p.end)}).`);

  let final = end;
  const why = calendar.whyNotBusiness(end);
  if (spec.moveToBusinessDay !== false && why) {
    final = calendar.nextBusinessDay(end);
    steps.push(`O termo cai em dia não útil (${why}): transfere-se para o 1.º dia útil seguinte, ${formatDate(final, 'long')}.`);
    legal.push(spec.judicial ? 'Código de Processo Civil, art. 138.º, n.º 2' : 'Código Civil, art. 279.º, al. e)');
  } else if (why) {
    steps.push(`O termo cai em dia não útil (${why}); a regra escolhida mantém a data.`);
  }
  if (spec.judicial && !suspended.length) steps.push('Não há férias judiciais dentro do período contado.');
  return { end, final, suspended, steps, legal: [...new Set(legal)], valid: true };
}

/** Rótulo curto para guardar na tarefa (regra do prazo). */
export function describeCount(spec: CountSpec, result: CountResult): string {
  const base = `${spec.count} ${UNIT_LABELS[spec.unit]} a contar de ${formatDate(spec.start)}${spec.judicial ? ', prazo judicial (suspenso nas férias judiciais)' : ''}`;
  return result.final && result.final !== result.end ? `${base}; termo em ${formatDate(result.end)}, transferido para ${formatDate(result.final)}` : `${base}; termo em ${formatDate(result.final)}`;
}

/** Sugestões de prazos frequentes (a validar em cada caso). */
export const COMMON_DEADLINES: Array<{ label: string; count: number; unit: CountUnit; judicial: boolean; note: string }> = [
  { label: 'Contestação (ação declarativa comum)', count: 30, unit: 'dias', judicial: true, note: 'CPC, art. 569.º, n.º 1 — 30 dias a contar da citação.' },
  { label: 'Recurso de apelação', count: 30, unit: 'dias', judicial: true, note: 'CPC, art. 638.º, n.º 1 — 30 dias (15 em processos urgentes).' },
  { label: 'Reclamação de créditos no inventário', count: 30, unit: 'dias', judicial: true, note: 'Regime do inventário (Lei n.º 117/2019) — prazo de oposição/reclamação após a citação (confirmar).' },
  { label: 'Repúdio ou aceitação após notificação (art. 2049.º CC)', count: 30, unit: 'dias', judicial: false, note: 'Herdeiro notificado para declarar se aceita ou repudia (prazo fixado pelo tribunal, em regra 30 dias).' },
  { label: 'Prazo geral em dias úteis (ex.: resposta a notificação administrativa)', count: 10, unit: 'dias_uteis', judicial: false, note: 'CPA, art. 86.º — 10 dias, salvo prazo especial.' },
  { label: 'Reclamação graciosa (AT)', count: 120, unit: 'dias', judicial: false, note: 'CPPT, art. 70.º — 120 dias a contar do termo do prazo de pagamento voluntário.' },
];
