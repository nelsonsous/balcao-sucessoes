import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { calculate, emptyCalcInput, newPerson } from '../engine/succession';
import { blocksToText } from '../engine/templates';
import { db, emptyAnswers, newAsset, newCase, newDebt, newParty, newTask } from './db';
import { buildReport, describeAsset, estateTotals, estateValue, loadCaseBundle, parseShare, partilhaSummary, verbas, writePartilha } from './reports';

const caseWith = (over: Partial<ReturnType<typeof newCase>> = {}) => ({ ...newCase({ name: 'Sucessão Teste', ref: 'BS-TEST-001' }), ...over });

describe('quota-parte e valor na herança', () => {
  it('interpreta frações, percentagens e vazio', () => {
    expect(parseShare('')).toBe(1);
    expect(parseShare('1/2')).toBe(0.5);
    expect(parseShare('50%')).toBe(0.5);
    expect(parseShare('0,25')).toBe(0.25);
    expect(parseShare('3/2')).toBe(1);
  });
  it('só metade dos bens comuns integra a herança em comunhão', () => {
    const a = newAsset('c1', { value: 200000, ownership: 'comum', share: '1/1' });
    expect(estateValue(a, true)).toBe(100000);
    expect(estateValue(a, false)).toBe(200000);
    expect(estateValue(newAsset('c1', { value: 90000, ownership: 'proprio', share: '1/3' }), true)).toBe(30000);
    expect(estateValue(newAsset('c1', { value: null }), true)).toBeNull();
  });
});

describe('relação de bens', () => {
  it('numera as verbas por grupo e descreve cada bem', () => {
    const assets = [
      newAsset('c1', { type: 'contas', bank: 'Banco Exemplo', iban: 'PT50 0000 0000 0000 0000 0000 0', value: 12000, valueBasis: 'saldo' }),
      newAsset('c1', { type: 'imoveis', description: 'Fração B', parish: 'Alvalade', matrixArticle: '1234-B', registryNumber: '567', value: 250000, valueBasis: 'vpt', ownership: 'comum' }),
      newAsset('c1', { type: 'veiculos', description: 'Automóvel', plate: '00-AA-00', value: 5000 }),
    ];
    const vs = verbas(assets);
    expect(vs.map((v) => v.n)).toEqual([1, 2, 3]);
    expect(vs[0]!.asset.type).toBe('imoveis');
    expect(vs[0]!.title).toBe('Fração B');
    expect(vs[0]!.details).toContain('artigo matricial n.º 1234-B');
    expect(vs[0]!.details).toContain('freguesia de Alvalade');
    expect(describeAsset(assets[0]!).title).toBe('Banco Exemplo — conta bancária');
    expect(describeAsset(assets[2]!).details).toBe('matrícula 00-AA-00');
  });
  it('calcula ativo, meação, passivo e valor líquido', () => {
    const c = caseWith({ answers: { ...emptyAnswers(), spouse: 'casado', regime: 'comunhao_adquiridos' } });
    const assets = [newAsset(c.id, { value: 200000, ownership: 'comum' }), newAsset(c.id, { value: 50000, ownership: 'proprio' }), newAsset(c.id, { value: null })];
    const debts = [newDebt(c.id, { amount: 10000, status: 'confirmado' }), newDebt(c.id, { amount: 999, status: 'pago' })];
    const t = estateTotals(c, assets, debts);
    expect(t.communal).toBe(true);
    expect(t.gross).toBe(250000);
    expect(t.meacao).toBe(100000);
    expect(t.liabilities).toBe(10000);
    expect(t.net).toBe(140000);
    expect(t.unvalued).toBe(1);
  });
});

describe('mapa de partilha', () => {
  it('calcula direito, recebido e tornas por herdeiro', () => {
    const c = caseWith({ answers: { ...emptyAnswers(), spouse: 'nao' } });
    const a1 = newAsset(c.id, { description: 'Casa', value: 300000, ownership: 'proprio' });
    const a2 = newAsset(c.id, { description: 'Conta', value: 100000, ownership: 'proprio' });
    const input = { ...emptyCalcInput(), children: [newPerson({ name: 'Ana' }), newPerson({ name: 'Rui' })], values: { own: 400000, common: null, debts: null, donations: null, testamentary: null } };
    const calc = calculate(input);
    const [ana, rui] = calc.shares;
    const sum = partilhaSummary(calc, c, [a1, a2], [], { assignments: { [a1.id]: ana!.key, [a2.id]: rui!.key }, notes: '' });
    expect(sum.estate).toBe(400000);
    expect(sum.heirs.map((h) => h.due)).toEqual([200000, 200000]);
    expect(sum.heirs[0]!.received).toBe(300000);
    expect(sum.heirs[0]!.diff).toBe(100000); // paga tornas
    expect(sum.heirs[1]!.diff).toBe(-100000); // recebe tornas
    expect(sum.unassigned).toEqual([]);
  });
  it('sem cálculo, usa o património e assinala bens por atribuir e para venda', () => {
    const c = caseWith();
    const a1 = newAsset(c.id, { value: 1000 });
    const a2 = newAsset(c.id, { value: 2000 });
    const sum = partilhaSummary(null, c, [a1, a2], [], { assignments: { [a2.id]: 'venda' }, notes: '' });
    expect(sum.source).toBe('patrimonio');
    expect(sum.estate).toBe(3000);
    expect(sum.heirs).toEqual([]);
    expect(sum.unassigned.map((a) => a.id)).toEqual([a1.id]);
    expect(sum.sale.map((a) => a.id)).toEqual([a2.id]);
    expect(sum.saleValue).toBe(2000);
  });
});

describe('relatórios do dossier', () => {
  it('gera os quatro relatórios a partir da base de dados', async () => {
    const c = caseWith({ answers: { ...emptyAnswers(), spouse: 'casado', regime: 'comunhao_adquiridos' }, generalNotes: 'Nota interna confidencial' });
    c.deceased = { ...c.deceased, name: 'Maria Teste', deathDate: '2026-03-01', nif: '123456789' };
    c.client = { ...c.client, name: 'João Teste', email: 'joao@example.com' };
    await db.cases.add(c);
    await db.parties.add(newParty(c.id, { name: 'João Teste', roles: ['herdeiro'], kinship: 'filho', isHeadOfEstate: true }));
    await db.assets.add(newAsset(c.id, { type: 'imoveis', description: 'Casa de morada', value: 200000, ownership: 'comum', valueBasis: 'vpt' }));
    await db.debts.add(newDebt(c.id, { creditor: 'Banco', amount: 20000, status: 'confirmado' }));
    await db.tasks.bulkAdd([
      newTask(c.id, { title: 'Obter certidão de óbito', status: 'concluido', phase: 'abertura' }),
      newTask(c.id, { title: 'Participar o óbito às Finanças', status: 'pendente', critical: true, dueDate: '2026-06-30', phase: 'fiscal' }),
      newTask(c.id, { title: 'Pedir saldos ao banco', status: 'aguarda', phase: 'patrimonio' }),
    ]);
    await db.documents.add({ ...(await import('./db')).newDocument(c.id, { name: 'Certidão de nascimento — João Teste', category: 'familia', status: 'em_falta', source: 'interessado', key: 'k1' }) });
    await db.notes.add({ id: 'n1', caseId: c.id, text: 'Cliente prefere email', pinned: true, createdAt: '2026-03-02T00:00:00Z', updatedAt: '2026-03-02T00:00:00Z' });
    const input = { ...emptyCalcInput(), spouse: { present: true, name: 'Cônjuge', regime: 'comunhao_adquiridos' as const }, children: [newPerson({ name: 'João Teste' })], values: { own: 0, common: 200000, debts: 20000, donations: null, testamentary: null } };
    c.calcJson = JSON.stringify(input);
    const calc = calculate(input);
    c.partilhaJson = writePartilha({ assignments: {}, notes: 'Acordo verbal' });
    await db.cases.put(c);

    const bundle = await loadCaseBundle(c);
    expect(bundle.calc?.shares.length).toBe(calc.shares.length);

    const interno = buildReport('interno', bundle);
    const txt = blocksToText(interno.blocks);
    expect(interno.title).toContain('Relatório do dossier');
    expect(txt).toContain('Participar o óbito às Finanças');
    expect(txt).toContain('Nota interna confidencial');
    expect(txt).toContain('Cliente prefere email');
    expect(txt).toContain('cabeça-de-casal');
    expect(interno.blocks.some((b) => b.type === 'table')).toBe(true);

    const cliente = buildReport('cliente', bundle);
    const ctxt = blocksToText(cliente.blocks);
    expect(ctxt).toContain('Obter certidão de óbito');
    expect(ctxt).toContain('Certidão de nascimento — João Teste');
    expect(ctxt).toContain('a aguardar resposta de terceiros');
    expect(ctxt).not.toContain('Nota interna confidencial');
    expect(ctxt).not.toContain('Cliente prefere email');
    expect(ctxt).not.toContain('crítica');

    const bens = buildReport('bens', bundle);
    const btxt = blocksToText(bens.blocks);
    expect(bens.title).toBe('Relação de bens — Maria Teste');
    expect(btxt).toContain('Casa de morada');
    expect(btxt).toContain('Meação do cônjuge');
    expect(btxt.replace(/\s/g, ' ')).toContain('100 000,00');

    const partilha = buildReport('partilha', bundle);
    const ptxt = blocksToText(partilha.blocks);
    expect(ptxt).toContain('Quotas hereditárias');
    expect(ptxt).toContain('Acordo verbal');
    expect(ptxt).toContain('Por atribuir');
    expect(partilha.fileBase).toMatch(/^mapa-de-partilha-bs-test-001-\d{4}-\d{2}-\d{2}$/);
  });
});
