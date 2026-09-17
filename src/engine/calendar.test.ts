import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine } from '../lib/ics';
import {
  HolidayCalendar,
  easterSunday,
  holidaysForYear,
  judicialHoliday,
  monthMatrix,
  resolveMunicipal,
  startOfWeek,
} from './calendar';
import { todayIso } from '../lib/utils';

describe('Páscoa e feriados móveis', () => {
  it('calcula o domingo de Páscoa', () => {
    expect(todayIso(easterSunday(2024))).toBe('2024-03-31');
    expect(todayIso(easterSunday(2025))).toBe('2025-04-20');
    expect(todayIso(easterSunday(2026))).toBe('2026-04-05');
    expect(todayIso(easterSunday(2027))).toBe('2027-03-28');
  });

  it('gera os feriados nacionais de 2026', () => {
    const h = holidaysForYear(2026);
    const by = new Map(h.map((x) => [x.name, x.date]));
    expect(by.get('Sexta-feira Santa')).toBe('2026-04-03');
    expect(by.get('Corpo de Deus')).toBe('2026-06-04');
    expect(by.get('Carnaval')).toBe('2026-02-17');
    expect(h.filter((x) => x.kind === 'nacional')).toHaveLength(13);
  });
});

describe('dias úteis', () => {
  const cal = new HolidayCalendar({ municipal: resolveMunicipal('lisboa') });

  it('feriados e fins de semana não são dias úteis; Carnaval é facultativo', () => {
    expect(cal.isBusinessDay('2026-10-05')).toBe(false); // Implantação da República (segunda)
    expect(cal.isBusinessDay('2026-10-03')).toBe(false); // sábado
    expect(cal.isBusinessDay('2026-10-06')).toBe(true);
    expect(cal.isBusinessDay('2026-06-13')).toBe(false); // Santo António (sábado, e municipal)
    expect(cal.isBusinessDay('2026-02-17')).toBe(true); // Carnaval
    expect(cal.whyNotBusiness('2026-12-25')).toBe('feriado (Natal)');
    expect(cal.whyNotBusiness('2026-10-04')).toBe('domingo');
  });

  it('transfere para o primeiro dia útil seguinte', () => {
    expect(cal.nextBusinessDay('2026-10-03')).toBe('2026-10-06');
    expect(cal.nextBusinessDay('2026-10-06')).toBe('2026-10-06');
    expect(cal.nextBusinessDay('2026-12-25')).toBe('2026-12-28');
    expect(cal.addBusinessDays('2026-12-31', 1)).toBe('2027-01-04');
  });

  it('feriado municipal personalizado', () => {
    expect(resolveMunicipal('24-06')).toMatchObject({ day: 24, month: 6 });
    expect(resolveMunicipal('32-01')).toBeNull();
    expect(resolveMunicipal('')).toBeNull();
    const porto = new HolidayCalendar({ municipal: resolveMunicipal('porto') });
    expect(porto.isBusinessDay('2026-06-24')).toBe(false);
    expect(cal.isBusinessDay('2026-06-24')).toBe(true);
  });
});

describe('férias judiciais', () => {
  it('reconhece os três períodos', () => {
    expect(judicialHoliday('2026-07-16')?.name).toContain('verão');
    expect(judicialHoliday('2026-08-31')).toBeDefined();
    expect(judicialHoliday('2026-09-01')).toBeUndefined();
    expect(judicialHoliday('2026-12-22')?.name).toContain('Natal');
    expect(judicialHoliday('2027-01-03')?.name).toContain('Natal');
    expect(judicialHoliday('2026-03-29')?.name).toContain('Páscoa'); // Domingo de Ramos
    expect(judicialHoliday('2026-04-06')?.name).toContain('Páscoa'); // Segunda-feira de Páscoa
    expect(judicialHoliday('2026-04-07')).toBeUndefined();
  });
});

describe('grelha do mês', () => {
  it('começa à segunda-feira e tem 6 semanas', () => {
    const m = monthMatrix(2026, 8); // setembro de 2026 (dia 1 é terça)
    expect(m).toHaveLength(6);
    expect(m[0]![0]).toBe('2026-08-31');
    expect(m[0]![1]).toBe('2026-09-01');
    expect(startOfWeek('2026-09-17')).toBe('2026-09-14');
  });
});

describe('iCalendar (.ics)', () => {
  it('escapa texto e dobra linhas longas em UTF-8', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe(String.raw`a\,b\;c\\d\ne`);
    const long = 'SUMMARY:' + 'Participação às Finanças '.repeat(6);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });

  it('gera eventos de dia inteiro e com hora, com alarmes', () => {
    const ics = buildIcs(
      [
        { uid: 'a@x', title: 'Prazo: Imposto do Selo', date: '2026-10-31', alarmDaysBefore: 3 },
        { uid: 'b@x', title: 'Escritura', date: '2026-10-09', time: '11:30', alarmMinutesBefore: 60, location: 'Cartório, Lisboa' },
      ],
      'Teste',
      new Date(Date.UTC(2026, 8, 17, 10, 0, 0)),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031');
    expect(ics).toContain('DTEND;VALUE=DATE:20261101');
    expect(ics).toContain('TRIGGER:-P2DT15H');
    expect(ics).toContain('DTSTART;TZID=Europe/Lisbon:20261009T113000');
    expect(ics).toContain('DTEND;TZID=Europe/Lisbon:20261009T123000');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics).toContain('LOCATION:Cartório\\, Lisboa');
    expect(ics).toContain('DTSTAMP:20260917T100000Z');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
  });
});
