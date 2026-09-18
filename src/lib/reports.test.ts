import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { calculate, emptyCalcInput, newPerson } from '../engine/succession';
import { blocksToText } from '../engine/templates';
import { db, emptyAnswers, newAsset, newCase, newDebt, newDocument, newEvent, newParty, newTask } from './db';
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
  it('assinala o excesso de imóveis sobre a quota (IMT e Imposto do Selo)', () => {
    const c = caseWith({ answers: { ...emptyAnswers(), spouse: 'nao' } });
    const casa = newAsset(c.id, { type: 'imoveis', description: 'Casa', value: 300000, ownership: 'proprio' });
    const conta = newAsset(c.id, { type: 'contas', description: 'Conta', value: 100000, ownership: 'proprio' });
    const input = { ...emptyCalcInput(), children: [newPerson({ name: 'Ana' }), newPerson({ name: 'Rui' })], values: { own: 400000, common: null, debts: null, donations: null, testamentary: null } };
    const calc = calculate(input);
    const [ana, rui] = calc.shares;
    const sum = partilhaSummary(calc, c, [casa, conta], [], { assignments: { [casa.id]: ana!.key, [conta.id]: rui!.key }, notes: '' });
    expect(sum.heirs[0]!.imoveisReceived).toBe(300000);
    expect(sum.heirs[0]!.imoveisExcess).toBe(100000);
    expect(sum.heirs[1]!.imoveisExcess).toBe(0);
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
    const casaId = (await db.assets.where('caseId').equals(c.id).toArray())[0]!.id;
    c.partilhaJson = writePartilha({ assignments: { [casaId]: calc.shares.find((s) => s.name === 'João Teste')!.key }, notes: 'Acordo verbal' });
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

    const fr = buildReport('cliente', bundle, 'fr');
    const frt = blocksToText(fr.blocks);
    expect(fr.title).toContain('Point d’étape');
    expect(frt).toContain('Ce dont nous avons besoin de votre part');
    expect(frt).toContain('Les intitulés des démarches');
    expect(frt).not.toContain('Nota interna confidencial');
    expect(fr.fileBase).toContain('-fr-');
    const en = buildReport('cliente', bundle, 'en');
    const ent = blocksToText(en.blocks);
    expect(en.title).toContain('Status update');
    expect(ent).toContain('What we need from you');
    expect(ent).toMatch(/\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
    expect(ent).toContain('Person in charge:');
    const partilha = buildReport('partilha', bundle);
    const ptxt = blocksToText(partilha.blocks);
    expect(ptxt).toContain('Quotas hereditárias');
    expect(ptxt).toContain('Acordo verbal');
    expect(ptxt).toContain('IMT');
    expect(partilha.fileBase).toMatch(/^mapa-de-partilha-bs-test-001-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('resumo de uma página', () => {
  const tableAfter = (blocks: ReturnType<typeof buildReport>['blocks'], heading: string) => {
    const i = blocks.findIndex((b) => b.type === 'h2' && b.lines[0]?.[0]?.text === heading);
    return blocks[i + 1]!;
  };
  const text = (cells: Array<{ text: string }>) => cells.map((r) => r.text).join('');

  it('mostra o essencial com listas limitadas (cabe numa folha)', async () => {
    const c = caseWith({ id: 'c-resumo', name: 'Herança Resumo', client: { ...newCase().client, name: 'Ana Cliente' } });
    c.deceased = { ...c.deceased, name: 'Manuel Resumo', deathDate: '2026-01-10', deathCity: 'Lisboa' };
    await db.cases.put(c);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const long = 'Tarefa com um título muito comprido que não cabe numa linha do resumo porque descreve demasiados pormenores do processo';
    await db.tasks.bulkAdd([
      ...Array.from({ length: 9 }, (_, i) => newTask(c.id, { title: `Tarefa ${i + 1}`, phase: 'abertura', status: 'pendente', order: i, dueDate: day(i + 1) })),
      newTask(c.id, { title: 'Atrasada', phase: 'fiscal', status: 'pendente', order: 50, dueDate: day(-3) }),
      newTask(c.id, { title: long, phase: 'fiscal', status: 'pendente', order: 51, critical: true }),
      newTask(c.id, { title: 'Concluída', phase: 'abertura', status: 'concluido', order: 60 }),
    ]);
    await db.events.bulkAdd(Array.from({ length: 7 }, (_, i) => newEvent({ caseId: c.id, title: `Reunião ${i + 1}`, kind: 'reuniao', date: day(i + 2), time: '10:00' })));
    await db.documents.bulkAdd(Array.from({ length: 8 }, (_, i) => newDocument(c.id, { name: `Documento ${i + 1}`, status: i === 0 ? 'pedido' : 'em_falta' })));
    await db.parties.bulkAdd([newParty(c.id, { name: 'Rita Herdeira', roles: ['herdeiro'], isHeadOfEstate: true, poa: 'recebida' }), newParty(c.id, { name: 'Rui Herdeiro', roles: ['herdeiro'], poa: 'a_pedir' })]);
    await db.assets.add(newAsset(c.id, { description: 'Casa', value: 200000, ownership: 'proprio' }));

    const r = buildReport('resumo', await loadCaseBundle(c));
    expect(r.title).toBe('Resumo do dossier — Herança Resumo');
    expect(r.fileBase).toMatch(/^resumo-1-pagina-bs-test-001-/);
    const txt = blocksToText(r.blocks);
    expect(txt).toContain('Manuel Resumo');
    expect(txt).toContain('Ana Cliente');
    expect(txt).toContain('cabeça-de-casal: Rita Herdeira · procurações 1/2');
    expect(txt).toMatch(/Ativo 200\s?000,00\s?€/);

    const first = tableAfter(r.blocks, 'A tratar primeiro');
    expect(first.rows!.length - 1).toBe(5);
    // primeiro o que está atrasado, depois as críticas; títulos longos cortados
    expect(text(first.rows![1]![0]!)).toBe('Atrasada');
    expect(text(first.rows![2]![0]!)).toMatch(/^★ Tarefa com um título muito comprido.*…$/);
    expect(text(first.rows![2]![0]!).length).toBeLessThanOrEqual(92);

    const upcoming = tableAfter(r.blocks, 'Próximos prazos e marcações');
    expect(upcoming.rows!.length - 1).toBe(5);
    const dates = upcoming.rows!.slice(1).map((row) => text(row[0]!).split('/').reverse().join('-'));
    expect([...dates].sort()).toEqual(dates);
    expect(upcoming.rows!.slice(1).some((row) => text(row[2]!).includes('10:00 — Reunião 1'))).toBe(true);

    expect(txt).toContain('Documento 1 (pedido); Documento 2; Documento 3; Documento 4; Documento 5; e mais 3.');
    expect(txt).toContain('validar pela equipa');
  });

  it('dossier vazio: frases curtas em vez de tabelas', async () => {
    const c = caseWith({ id: 'c-vazio', name: 'Herança Vazia' });
    await db.cases.put(c);
    const txt = blocksToText(buildReport('resumo', await loadCaseBundle(c)).blocks);
    expect(txt).toContain('Sem tarefas em aberto.');
    expect(txt).toContain('Sem prazos nem marcações futuras.');
    expect(txt).toContain('Nenhum documento em falta.');
    expect(txt).toContain('cabeça-de-casal: por designar');
  });
});
