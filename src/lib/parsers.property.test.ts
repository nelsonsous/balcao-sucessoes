import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { parseShare } from './reports';
import { maskName, normalize, parseAmount } from './utils';

describe('parsers robustos a qualquer entrada', () => {
  it('parseAmount nunca lança e devolve número finito ou null', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const v = parseAmount(s);
        expect(v === null || Number.isFinite(v)).toBe(true);
      }),
    );
  });
  it('parseAmount lê os formatos portugueses e ingleses', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.integer({ min: 0, max: 99 }), (int, cents) => {
        const pt = `${int.toLocaleString('pt-PT')},${String(cents).padStart(2, '0')}`.replace(/\u00a0|\u202f/g, ' ');
        expect(parseAmount(pt)).toBeCloseTo(int + cents / 100, 2);
        expect(parseAmount(`${int}.${String(cents).padStart(2, '0')}`)).toBeCloseTo(int + cents / 100, 2);
      }),
    );
  });
  it('parseShare fica sempre entre 0 e 1', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const v = parseShare(s);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }), (n, d) => {
        expect(parseShare(`${n}/${d}`)).toBeCloseTo(Math.min(1, n / d), 12);
      }),
    );
  });
  it('maskName nunca revela mais de uma letra de cada palavra longa e não lança', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const m = maskName(s);
        for (const w of m.split(' ')) if (w.endsWith('.')) expect(w.length).toBe(2);
      }),
    );
  });
  it('normalize é idempotente e sem acentos', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const n = normalize(s);
        expect(normalize(n)).toBe(n);
        expect(/[̀-ͯ]/.test(n)).toBe(false);
        expect(n).toBe(n.toLowerCase());
      }),
    );
  });
});

describe('CSV', () => {
  it('cada linha tem o mesmo número de colunas e as células com separadores ficam entre aspas', () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.oneof(fc.string(), fc.integer(), fc.constant(null)), { minLength: 3, maxLength: 3 }), { maxLength: 8 }), (rows) => {
        const csv = toCsv(['a', 'b', 'c'], rows);
        expect(csv.startsWith('\uFEFF')).toBe(true);
        const lines = csv.slice(1).split('\r\n').filter((_l, i, arr) => i < arr.length - 1);
        expect(lines.length).toBe(rows.length + 1);
        // contagem de separadores fora de aspas
        for (const line of lines) {
          let inQ = false;
          let seps = 0;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQ = !inQ;
            else if (ch === ';' && !inQ) seps += 1;
          }
          expect(seps).toBe(2);
        }
      }),
    );
  });
});
