import { describe, expect, it } from 'vitest';
import { calcInputFromCase, readCalc, writeCalc } from './calcImport';
import { db, emptyAnswers, newAsset, newCase, newDebt, newParty } from './db';
import { emptyCalcInput } from '../engine/succession';

describe('simulação de quotas guardada no dossier', () => {
  it('lê e escreve o JSON e ignora conteúdos inválidos', () => {
    const c = newCase({ name: 'X', ref: 'R' });
    expect(readCalc(c)).toBeNull();
    const input = { ...emptyCalcInput(), deceasedName: 'Maria' };
    c.calcJson = writeCalc(input);
    expect(readCalc(c)?.deceasedName).toBe('Maria');
    c.calcJson = '{not json';
    expect(readCalc(c)).toBeNull();
  });

  it('importa cônjuge, filhos, netos, ascendentes, valores e passivo a partir do dossier', async () => {
    const c = newCase({ name: 'Sucessão Import', ref: 'BS-I-1', answers: { ...emptyAnswers(), spouse: 'casado', regime: 'desconhecido', descendants: 'sim', descendantsCount: '5', ascendants: 'nao' } });
    c.deceased.name = 'Maria Import';
    await db.cases.add(c);
    await db.parties.bulkAdd([
      newParty(c.id, { name: 'João Cônjuge', kinship: 'conjuge', roles: ['conjuge'] }),
      newParty(c.id, { name: 'Ana Filha', kinship: 'filho', roles: ['herdeiro'] }),
      newParty(c.id, { name: 'Rui Filho', kinship: 'filho', roles: ['herdeiro'], acceptance: 'repudiou' }),
      newParty(c.id, { name: 'Neto Um', kinship: 'neto', roles: ['herdeiro'] }),
    ]);
    await db.assets.bulkAdd([newAsset(c.id, { value: 100000, ownership: 'comum' }), newAsset(c.id, { value: 30000, ownership: 'proprio' })]);
    await db.debts.add(newDebt(c.id, { amount: 5000, status: 'confirmado' }));
    const { input, notes } = await calcInputFromCase(c);
    expect(input.deceasedName).toBe('Maria Import');
    expect(input.spouse.present).toBe(true);
    expect(input.spouse.regime).toBe('comunhao_adquiridos');
    expect(notes.some((n) => /Regime de bens desconhecido/.test(n))).toBe(true);
    const names = input.children.map((p) => p.name);
    expect(names).toContain('Ana Filha');
    expect(input.children.find((p) => p.name === 'Rui Filho')?.status).toBe('repudiou');
    expect(input.children.some((p) => p.descendants.some((d) => d.name === 'Neto Um'))).toBe(true);
    expect(notes.some((n) => /Netos importados/.test(n))).toBe(true);
    expect(notes.some((n) => /questionário indica 5 filhos/.test(n))).toBe(true);
    expect(input.values.common).toBe(100000);
    expect(input.values.own).toBe(30000);
    expect(input.values.debts).toBe(5000);
  });

  it('assinala a união de facto e a ausência de valores', async () => {
    const c = newCase({ name: 'UF', ref: 'BS-I-2', answers: { ...emptyAnswers(), spouse: 'uniao_facto' } });
    await db.cases.add(c);
    const { input, notes } = await calcInputFromCase(c);
    expect(input.spouse.present).toBe(false);
    expect(notes.some((n) => /unido de facto/i.test(n))).toBe(true);
    expect(input.values.own).toBeNull();
  });
});
