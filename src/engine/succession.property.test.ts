import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { add, div, eq, frac, mul, sub, sum, toNumber, ONE, ZERO } from './fraction';
import { calculate, emptyCalcInput, newPerson, type CalcInput, type CalcPerson, type HeirStatus } from './succession';

const status = fc.constantFrom<HeirStatus>('vivo', 'vivo', 'vivo', 'predefunto', 'repudiou', 'indigno');

const person = (depth: number): fc.Arbitrary<CalcPerson> =>
  fc
    .record({
      name: fc.constantFrom('Ana', 'Rui', 'Sofia', 'Tiago', ''),
      status,
      descendants: depth > 0 ? fc.array(person(depth - 1), { maxLength: 2 }) : fc.constant<CalcPerson[]>([]),
    })
    .map((p): CalcPerson => newPerson({ name: p.name, status: p.status, descendants: p.descendants }));

const input: fc.Arbitrary<CalcInput> = fc
  .record({
    spouse: fc.record({ present: fc.boolean(), name: fc.constant('C'), regime: fc.constantFrom('comunhao_adquiridos', 'comunhao_geral', 'separacao') }),
    children: fc.array(person(2), { maxLength: 3 }),
    parents: fc.integer({ min: 0, max: 2 }),
    grandparents: fc.integer({ min: 0, max: 4 }),
    siblings: fc.array(person(1).map((p) => ({ ...p, kind: 'germano' as const })), { maxLength: 3 }),
    collaterals: fc.array(person(0).map((p) => ({ ...p, degree: 3 as const })), { maxLength: 2 }),
    values: fc.record({
      own: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
      common: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
      debts: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
      donations: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
      testamentary: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
    }),
  })
  .map((r) => ({ ...emptyCalcInput(), ...r }));

describe('invariantes da calculadora sucessória', () => {
  it('as quotas somam exatamente 1 (ou 0 sem herdeiros) e nunca são negativas', () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = calculate(i);
        const total = sum(r.shares.map((s) => s.fraction));
        expect(r.shares.every((s) => s.fraction.n > 0 && s.fraction.d > 0)).toBe(true);
        expect(eq(total, ONE) || (r.shares.length === 0 && eq(total, ZERO))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
  it('a legítima nunca excede a herança e os valores não são NaN nem negativos', () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = calculate(i);
        expect(toNumber(r.legitimaFraction)).toBeGreaterThanOrEqual(0);
        expect(toNumber(r.legitimaFraction)).toBeLessThanOrEqual(1);
        expect(toNumber(add(r.legitimaFraction, r.availableFraction))).toBeCloseTo(1, 9);
        for (const v of Object.values(r.values)) expect(Number.isNaN(v)).toBe(false);
        expect(r.values.relictum).toBeGreaterThanOrEqual(0);
        expect(r.values.meacao).toBeGreaterThanOrEqual(0);
        expect(r.values.excess).toBeGreaterThanOrEqual(0);
        expect(r.values.stampDuty).toBeGreaterThanOrEqual(0);
        // passivo superior ao ativo → herança negativa, com aviso de aceitação a benefício de inventário
        if (r.values.net < 0) expect(r.warnings.some((w) => /benefício de inventário/.test(w))).toBe(true);
        for (const s of r.shares) {
          if (s.amount !== null && r.values.net >= 0) expect(s.amount).toBeGreaterThanOrEqual(0);
          if (s.stampDuty !== null) expect(s.stampDuty).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 300 },
    );
  });
  it('é determinística e o cônjuge, quando concorre com descendentes, nunca recebe menos de ¼', () => {
    fc.assert(
      fc.property(input, (i) => {
        const a = calculate(i);
        const b = calculate(JSON.parse(JSON.stringify(i)) as CalcInput);
        expect(JSON.stringify(a.shares.map((s) => [s.key, s.fraction]))).toBe(JSON.stringify(b.shares.map((s) => [s.key, s.fraction])));
        const spouse = a.shares.find((s) => s.key === 'conjuge');
        if (spouse && a.klass === 'descendentes') expect(toNumber(spouse.fraction)).toBeGreaterThanOrEqual(0.25 - 1e-12);
      }),
      { numRuns: 300 },
    );
  });
});

describe('aritmética de frações', () => {
  const f = fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: 1, max: 500 })).map(([n, d]) => frac(n, d));
  it('é sempre normalizada (denominador positivo, termos primos entre si)', () => {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
    fc.assert(
      fc.property(f, f, (a, b) => {
        for (const x of [add(a, b), sub(a, b), mul(a, b)]) {
          expect(x.d).toBeGreaterThan(0);
          expect(gcd(x.n, x.d)).toBe(1);
        }
        if (b.n !== 0) expect(div(a, b).d).toBeGreaterThan(0);
      }),
    );
  });
  it('respeita comutatividade e inversos', () => {
    fc.assert(
      fc.property(f, f, (a, b) => {
        expect(eq(add(a, b), add(b, a))).toBe(true);
        expect(eq(mul(a, b), mul(b, a))).toBe(true);
        expect(eq(sub(add(a, b), b), a)).toBe(true);
        if (b.n !== 0) expect(eq(div(mul(a, b), b), a)).toBe(true);
      }),
    );
  });
});
