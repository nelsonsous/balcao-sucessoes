import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HolidayCalendar } from './calendar';
import { COMMON_DEADLINES, countDeadline, describeCount } from './prazos';

const cal = new HolidayCalendar();

describe('contagem de prazos', () => {
  it('dias corridos: o dia do facto não conta e o termo em fim de semana passa para segunda-feira', () => {
    // 2026-09-17 é quinta-feira; 10 dias corridos → 2026-09-27 (domingo) → 2026-09-28
    const r = countDeadline({ start: '2026-09-17', count: 10, unit: 'dias' }, cal);
    expect(r.end).toBe('2026-09-27');
    expect(r.final).toBe('2026-09-28');
    expect(r.steps.some((s) => /domingo/.test(s))).toBe(true);
    expect(r.legal).toContain('Código Civil, art. 279.º, al. e)');
    const keep = countDeadline({ start: '2026-09-17', count: 10, unit: 'dias', moveToBusinessDay: false }, cal);
    expect(keep.final).toBe('2026-09-27');
  });

  it('dias úteis saltam fins de semana e feriados', () => {
    // 2026-12-04 (sexta) + 5 dias úteis: 7, 9, 10, 11, 14 (8/12 é feriado) → 2026-12-14
    const r = countDeadline({ start: '2026-12-04', count: 5, unit: 'dias_uteis' }, cal);
    expect(r.final).toBe('2026-12-14');
  });

  it('prazo judicial suspende-se nas férias judiciais de verão', () => {
    // 2026-07-10 (sexta) + 30 dias judiciais: 11–15 jul (5 dias), suspenso 16/7–31/8, retoma 1/9 → faltam 25 → 2026-09-25 (sexta)
    const r = countDeadline({ start: '2026-07-10', count: 30, unit: 'dias', judicial: true }, cal);
    expect(r.suspended.map((p) => p.name)).toEqual(['Férias judiciais (verão)']);
    expect(r.final).toBe('2026-09-25');
    expect(r.legal).toContain('Código de Processo Civil, art. 138.º, n.º 1');
    const civil = countDeadline({ start: '2026-07-10', count: 30, unit: 'dias' }, cal);
    expect(civil.final).toBe('2026-08-10');
  });

  it('prazo judicial em dias úteis também ignora as férias', () => {
    const r = countDeadline({ start: '2026-12-18', count: 3, unit: 'dias_uteis', judicial: true }, cal);
    // 21/12 (seg) conta 1; 22/12–3/1 suspenso; 4/1 (seg) conta 2; 5/1 conta 3
    expect(r.final).toBe('2027-01-05');
    expect(r.suspended[0]!.name).toContain('Natal');
  });

  it('meses e anos terminam no dia correspondente (ou no último dia do mês)', () => {
    expect(countDeadline({ start: '2026-01-31', count: 1, unit: 'meses' }, cal).end).toBe('2026-02-28');
    expect(countDeadline({ start: '2026-03-15', count: 6, unit: 'meses' }, cal).end).toBe('2026-09-15');
    expect(countDeadline({ start: '2026-03-15', count: 2, unit: 'anos' }, cal).end).toBe('2028-03-15');
  });

  it('valida entradas e descreve a regra', () => {
    expect(countDeadline({ start: '', count: 5, unit: 'dias' }, cal).valid).toBe(false);
    expect(countDeadline({ start: '2026-01-01', count: 0, unit: 'dias' }, cal).valid).toBe(false);
    const spec = { start: '2026-09-17', count: 10, unit: 'dias' as const };
    const r = countDeadline(spec, cal);
    expect(describeCount(spec, r)).toBe('10 dias corridos a contar de 17/09/2026; termo em 27/09/2026, transferido para 28/09/2026');
    expect(COMMON_DEADLINES.length).toBeGreaterThan(4);
  });

  it('propriedades: termo sempre posterior ao início, monótono no número de dias e nunca em dia não útil (com transferência)', () => {
    const date = fc.integer({ min: 0, max: 730 }).map((n) => {
      const d = new Date(2026, 0, 1, 12);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    });
    fc.assert(
      fc.property(date, fc.integer({ min: 1, max: 60 }), fc.constantFrom<'dias' | 'dias_uteis'>('dias', 'dias_uteis'), fc.boolean(), (start, n, unit, judicial) => {
        const a = countDeadline({ start, count: n, unit, judicial }, cal);
        const b = countDeadline({ start, count: n + 1, unit, judicial }, cal);
        expect(a.valid).toBe(true);
        expect(a.final > start).toBe(true);
        expect(b.end >= a.end).toBe(true);
        expect(cal.isBusinessDay(a.final)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
