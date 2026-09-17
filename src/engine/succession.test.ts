import { describe, expect, it } from 'vitest';
import { fmtFrac, frac, eq } from './fraction';
import { calculate, emptyCalcInput, newPerson, totalShares, type CalcInput } from './succession';

const input = (p: Partial<CalcInput>): CalcInput => ({ ...emptyCalcInput(), ...p });
const spouse = { present: true, name: 'Cônjuge', regime: 'comunhao_adquiridos' as const };
const kid = (name: string, extra: Partial<Parameters<typeof newPerson>[0]> = {}) => newPerson({ name, ...extra });
const shareOf = (r: ReturnType<typeof calculate>, name: string) => fmtFrac(r.shares.find((s) => s.name === name)!.fraction);

describe('1.ª classe — cônjuge e descendentes', () => {
  it('cônjuge e 2 filhos: partes iguais; legítima ⅔', () => {
    const r = calculate(input({ spouse, children: [kid('A'), kid('B')] }));
    expect(r.klass).toBe('descendentes');
    expect(shareOf(r, 'Cônjuge')).toBe('1/3');
    expect(shareOf(r, 'A')).toBe('1/3');
    expect(fmtFrac(r.legitimaFraction)).toBe('2/3');
    expect(fmtFrac(r.availableFraction)).toBe('1/3');
    expect(eq(totalShares(r), frac(1))).toBe(true);
    expect(fmtFrac(r.shares.find((s) => s.name === 'A')!.legitima)).toBe('2/9');
  });

  it('cônjuge e 3 filhos: ¼ para cada', () => {
    const r = calculate(input({ spouse, children: [kid('A'), kid('B'), kid('C')] }));
    expect(r.shares.map((s) => fmtFrac(s.fraction))).toEqual(['1/4', '1/4', '1/4', '1/4']);
  });

  it('cônjuge e 5 filhos: o cônjuge tem ¼ garantido', () => {
    const r = calculate(input({ spouse, children: ['A', 'B', 'C', 'D', 'E'].map((n) => kid(n)) }));
    expect(shareOf(r, 'Cônjuge')).toBe('1/4');
    expect(shareOf(r, 'E')).toBe('3/20');
    expect(eq(totalShares(r), frac(1))).toBe(true);
    expect(fmtFrac(r.shares[0]!.legitima)).toBe('1/6');
  });

  it('um só filho: tudo, legítima ½; dois filhos sem cônjuge: legítima ⅔', () => {
    const one = calculate(input({ children: [kid('A')] }));
    expect(shareOf(one, 'A')).toBe('1');
    expect(fmtFrac(one.legitimaFraction)).toBe('1/2');
    const two = calculate(input({ children: [kid('A'), kid('B')] }));
    expect(shareOf(two, 'B')).toBe('1/2');
    expect(fmtFrac(two.legitimaFraction)).toBe('2/3');
  });

  it('representação: filho pré-falecido com 2 netos', () => {
    const r = calculate(
      input({
        spouse,
        children: [kid('A'), kid('B', { status: 'predefunto', descendants: [kid('B1'), kid('B2')] })],
      }),
    );
    expect(shareOf(r, 'Cônjuge')).toBe('1/3');
    expect(shareOf(r, 'A')).toBe('1/3');
    expect(shareOf(r, 'B1')).toBe('1/6');
    expect(r.shares.find((s) => s.name === 'B2')!.via).toEqual(['B (pré-falecido)']);
    expect(eq(totalShares(r), frac(1))).toBe(true);
  });

  it('repúdio sem descendentes acresce aos outros; com descendentes há representação', () => {
    const r1 = calculate(input({ children: [kid('A'), kid('B', { status: 'repudiou' })] }));
    expect(r1.shares).toHaveLength(1);
    expect(shareOf(r1, 'A')).toBe('1');
    expect(fmtFrac(r1.legitimaFraction)).toBe('1/2'); // só uma estirpe é chamada
    const r2 = calculate(input({ children: [kid('A'), kid('B', { status: 'repudiou', descendants: [kid('B1')] })] }));
    expect(shareOf(r2, 'B1')).toBe('1/2');
  });

  it('ascendentes não são chamados havendo descendentes', () => {
    const r = calculate(input({ children: [kid('A')], parents: 2 }));
    expect(r.shares).toHaveLength(1);
    expect(r.warnings.join(' ')).toContain('2134');
  });
});

describe('2.ª classe — cônjuge e ascendentes', () => {
  it('cônjuge e 2 pais: ⅔ + ⅙ + ⅙', () => {
    const r = calculate(input({ spouse, parents: 2 }));
    expect(r.klass).toBe('ascendentes');
    expect(r.shares.map((s) => fmtFrac(s.fraction))).toEqual(['2/3', '1/6', '1/6']);
    expect(fmtFrac(r.legitimaFraction)).toBe('2/3');
    expect(fmtFrac(r.shares[0]!.legitima)).toBe('4/9');
  });

  it('pais afastam avós; sem cônjuge a legítima dos pais é ½', () => {
    const r = calculate(input({ parents: 1, grandparents: 2 }));
    expect(r.shares).toHaveLength(1);
    expect(fmtFrac(r.shares[0]!.fraction)).toBe('1');
    expect(fmtFrac(r.legitimaFraction)).toBe('1/2');
  });

  it('só avós: por cabeça, legítima ⅓', () => {
    const r = calculate(input({ grandparents: 3 }));
    expect(r.shares.map((s) => fmtFrac(s.fraction))).toEqual(['1/3', '1/3', '1/3']);
    expect(fmtFrac(r.legitimaFraction)).toBe('1/3');
  });
});

describe('cônjuge sozinho, irmãos, colaterais e Estado', () => {
  it('cônjuge sem descendentes nem ascendentes: tudo, legítima ½; afasta irmãos', () => {
    const r = calculate(input({ spouse, siblings: [kid('Irmão')] }));
    expect(r.klass).toBe('conjuge');
    expect(fmtFrac(r.shares[0]!.fraction)).toBe('1');
    expect(fmtFrac(r.legitimaFraction)).toBe('1/2');
  });

  it('irmãos germanos recebem o dobro dos unilaterais', () => {
    const r = calculate(
      input({ siblings: [kid('G', { kind: 'germano' }), kid('U1', { kind: 'unilateral' }), kid('U2', { kind: 'unilateral' })] }),
    );
    expect(r.klass).toBe('irmaos');
    expect(shareOf(r, 'G')).toBe('1/2');
    expect(shareOf(r, 'U1')).toBe('1/4');
    expect(fmtFrac(r.legitimaFraction)).toBe('0');
    expect(r.shares.every((s) => s.taxed)).toBe(true);
  });

  it('sobrinhos representam irmão germano pré-falecido', () => {
    const r = calculate(
      input({
        siblings: [
          kid('G', { kind: 'germano', status: 'predefunto', descendants: [kid('S1'), kid('S2')] }),
          kid('U', { kind: 'unilateral' }),
        ],
      }),
    );
    expect(shareOf(r, 'S1')).toBe('1/3');
    expect(shareOf(r, 'U')).toBe('1/3');
    expect(eq(totalShares(r), frac(1))).toBe(true);
  });

  it('colaterais: o grau mais próximo prefere', () => {
    const r = calculate(input({ collaterals: [kid('Tio', { degree: 3 }), kid('Primo', { degree: 4 })] }));
    expect(r.klass).toBe('colaterais');
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0]!.name).toBe('Tio');
  });

  it('sem sucessíveis: Estado', () => {
    const r = calculate(emptyCalcInput());
    expect(r.klass).toBe('estado');
    expect(r.shares[0]!.name).toBe('Estado');
    expect(r.shares[0]!.taxed).toBe(false);
  });
});

describe('valores, meação e inoficiosidade', () => {
  it('meação, passivo, doações, legítima e quota disponível', () => {
    const r = calculate(
      input({
        spouse,
        children: [kid('A'), kid('B')],
        values: { own: 100_000, common: 200_000, debts: 20_000, donations: 30_000, testamentary: 80_000 },
      }),
    );
    expect(r.values.meacao).toBe(100_000);
    expect(r.values.relictum).toBe(200_000);
    expect(r.values.net).toBe(180_000);
    expect(r.values.base).toBe(210_000);
    expect(Math.round(r.values.legitima)).toBe(140_000);
    expect(Math.round(r.values.available)).toBe(70_000);
    expect(Math.round(r.values.excess)).toBe(10_000);
    expect(Math.round(r.shares[1]!.amount!)).toBe(60_000);
    expect(r.warnings.join(' ')).toContain('inoficiosas');
  });

  it('separação de bens: sem meação; irmãos pagam 10% de Imposto do Selo (estimativa)', () => {
    const r = calculate(input({ siblings: [kid('A'), kid('B')], values: { own: 50_000, common: null, debts: null, donations: null, testamentary: null } }));
    expect(r.values.meacao).toBe(0);
    expect(r.values.stampDuty).toBeCloseTo(5_000);
  });
});
