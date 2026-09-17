import { describe, expect, it } from 'vitest';
import { wipeAll } from './backup';
import { db, emptyAnswers, newAsset, newCase, newDocument, newParty, newTask } from './db';
import { buildOverview } from './hooks';
import { EMPTY_FILTERS, PRESET_VIEWS, applyFilters, buildDeepIndex, countActive, deleteView, describeFilters, filtersFromSearch, filtersToSearch, isInternational, listViews, presetFilters, sameFilters, saveView, type Filters } from './views';

const TODAY = new Date(2026, 8, 17, 12);
const iso = (d: number) => new Date(TODAY.getTime() + d * 86_400_000).toISOString().slice(0, 10);

function fixture() {
  const a = newCase({ id: 'a', name: 'Sucessão Alves', ref: 'BS-1', responsibleId: 'ana', priority: 'urgente', tags: ['França', 'Imóveis'], stage: 'ativo', deceased: { name: 'António Alves', nif: '', birthDate: '', deathDate: iso(-40), deathCity: '', lastAddress: '' }, answers: { ...emptyAnswers(), deathPlace: 'estrangeiro' } });
  const b = newCase({ id: 'b', name: 'Sucessão Bento', ref: 'BS-2', responsibleId: 'rui', priority: 'normal', tags: [], stage: 'ativo', deceased: { name: 'Berta Bento', nif: '', birthDate: '', deathDate: iso(-500), deathCity: '', lastAddress: '' } });
  const c = newCase({ id: 'c', name: 'Sucessão Costa', ref: 'BS-3', responsibleId: 'ana', priority: 'alta', tags: ['Imóveis'], stage: 'concluido', deceased: { name: 'Carlos Costa', nif: '', birthDate: '', deathDate: iso(-200), deathCity: '', lastAddress: '' } });
  const oa = buildOverview(a, [
    newTask('a', { id: 'a1', phase: 'abertura', title: 'Certidão', status: 'concluido' }),
    newTask('a', { id: 'a2', phase: 'patrimonio', title: 'Registo', status: 'pendente', dueDate: iso(-3), critical: true }), // ultrapassado
  ]);
  const ob = buildOverview(b, [newTask('b', { id: 'b1', phase: 'abertura', title: 'Procuração', status: 'em_curso', dueDate: iso(5) })]);
  const oc = buildOverview(c, [newTask('c', { id: 'c1', phase: 'abertura', title: 'Tudo', status: 'concluido' })]);
  return { a, b, c, list: [oa, ob, oc] };
}

const ids = (xs: { c: { id: string } }[]) => xs.map((x) => x.c.id);

describe('filtros avançados da lista de dossiers', () => {
  it('filtra por situação, responsável, semáforo, prioridade, etiqueta, fase, prazo, óbito e internacional', () => {
    const { list } = fixture();
    const f = (p: Partial<Filters>): string[] => ids(applyFilters(list, { ...EMPTY_FILTERS, ...p }, { today: TODAY }));
    expect(f({})).toEqual(['a', 'b']); // abertos
    expect(f({ stage: 'todos' })).toEqual(['a', 'b', 'c']);
    expect(f({ stage: 'concluido' })).toEqual(['c']);
    expect(f({ resp: 'ana' })).toEqual(['a']);
    expect(f({ health: 'atencao' })).toEqual(['a']); // prazo ultrapassado
    expect(f({ health: 'andamento' })).toEqual(['b']);
    expect(f({ stage: 'todos', health: 'concluidos' })).toEqual(['c']);
    expect(f({ priority: 'urgente' })).toEqual(['a']);
    expect(f({ tag: 'imoveis' })).toEqual(['a']); // sem acentos, sem maiúsculas
    expect(f({ stage: 'todos', tag: 'Imóveis' })).toEqual(['a', 'c']);
    expect(f({ phase: 'patrimonio' })).toEqual(['a']);
    expect(f({ phase: 'abertura' })).toEqual(['b']);
    expect(f({ due: 'ultrapassado' })).toEqual(['a']);
    expect(f({ due: '7d' })).toEqual(['b']);
    expect(f({ due: '30d' })).toEqual(['b']);
    expect(f({ stage: 'todos', due: 'sem' })).toEqual(['c']);
    expect(f({ death: '3m' })).toEqual(['a']);
    expect(f({ stage: 'todos', death: '12m' })).toEqual(['a', 'c']);
    expect(f({ death: 'mais1a' })).toEqual(['b']);
    expect(f({ intl: 'sim' })).toEqual(['a']);
    expect(f({ intl: 'nao' })).toEqual(['b']);
    expect(f({ q: 'berta' })).toEqual(['b']);
    expect(f({ q: 'bs-1' })).toEqual(['a']);
  });

  it('pesquisa profunda encontra em notas, contactos, documentos, interessados e bens só quando ativa', () => {
    const { list } = fixture();
    const deep = buildDeepIndex({
      notes: [{ id: 'n1', caseId: 'b', text: 'Falar com o notário Dr. Xavier', pinned: false, createdAt: '', updatedAt: '' }],
      contacts: [{ id: 'k1', caseId: 'a', date: '2026-09-01', person: 'Banco Zeta', role: 'outro', channel: 'email', summary: 'Pedido de saldos', followUp: '', followUpDone: false, createdAt: '' }],
      documents: [newDocument('a', { name: 'Certidão de óbito', fileName: 'obito-lyon.pdf' })],
      parties: [newParty('b', { name: 'Quitéria Bento' })],
      assets: [newAsset('a', { description: 'Apartamento em Lyon' })],
    });
    const f = (p: Partial<Filters>) => ids(applyFilters(list, { ...EMPTY_FILTERS, ...p }, { today: TODAY, deep }));
    expect(f({ q: 'xavier' })).toEqual([]);
    expect(f({ q: 'xavier', deep: true })).toEqual(['b']);
    expect(f({ q: 'zeta', deep: true })).toEqual(['a']);
    expect(f({ q: 'lyon', deep: true })).toEqual(['a']);
    expect(f({ q: 'quiteria', deep: true })).toEqual(['b']);
    expect(f({ q: 'alves', deep: true })).toEqual(['a']); // a ficha continua a contar
  });

  it('conta, compara e descreve os filtros ativos', () => {
    expect(countActive(EMPTY_FILTERS)).toBe(0);
    const f: Filters = { ...EMPTY_FILTERS, q: 'x', priority: 'urgente', due: '7d', resp: 'ana', tag: 'França', phase: 'fiscal', death: '3m', intl: 'sim', stage: 'todos', health: 'atencao' };
    expect(countActive(f)).toBe(9);
    expect(sameFilters(EMPTY_FILTERS, { ...EMPTY_FILTERS })).toBe(true);
    expect(sameFilters(EMPTY_FILTERS, f)).toBe(false);
    const chips = describeFilters(f, [{ id: 'ana', name: 'Ana Silva', role: '', color: '', createdAt: '' }]);
    expect(chips.map((c) => c.label)).toEqual(['Situação: Todos', 'Semáforo: Atenção', 'Responsável: Ana Silva', 'Prioridade: Urgente', 'Etiqueta: França', 'Fase: Fiscal', 'Prazo nos próximos 7 dias', 'Óbito nos últimos 3 meses', 'Com elementos internacionais']);
    expect(chips.map((c) => c.key)).toContain('due');
  });

  it('sincroniza os filtros com o endereço e ignora valores desconhecidos', () => {
    const f: Filters = { ...EMPTY_FILTERS, q: 'alves', priority: 'urgente', due: '7d', tag: 'França', deep: true, stage: 'todos' };
    const s = filtersToSearch(f);
    expect(s).toBe('q=alves&saude=todos&situacao=todos&prio=urgente&etiqueta=Fran%C3%A7a&prazo=7d&deep=1'.replace('saude=todos&', ''));
    expect(filtersFromSearch(s)).toEqual(f);
    expect(filtersFromSearch('?' + s)).toEqual(f);
    expect(filtersToSearch(EMPTY_FILTERS)).toBe('');
    expect(filtersFromSearch('')).toEqual(EMPTY_FILTERS);
    expect(filtersFromSearch('prio=maxima&prazo=amanha&fase=inventada&importar=1&intl=sim')).toEqual({ ...EMPTY_FILTERS, intl: 'sim' });
  });

  it('vistas predefinidas e guardadas (com substituição pelo nome e remoção)', async () => {
    await wipeAll();
    expect(PRESET_VIEWS.length).toBeGreaterThanOrEqual(5);
    expect(presetFilters(PRESET_VIEWS[0]!)).toEqual({ ...EMPTY_FILTERS, due: 'ultrapassado' });
    expect(await listViews()).toEqual([]);
    const v1 = await saveView('  Urgentes de setembro ', { ...EMPTY_FILTERS, priority: 'urgente' });
    expect(v1.name).toBe('Urgentes de setembro');
    await saveView('Atrasos', { ...EMPTY_FILTERS, due: 'ultrapassado' });
    let views = await listViews();
    expect(views.map((v) => v.name)).toEqual(['Atrasos', 'Urgentes de setembro']);
    // mesmo nome (sem acentos/maiúsculas) substitui
    await saveView('urgentes de SETEMBRO', { ...EMPTY_FILTERS, priority: 'alta' });
    views = await listViews();
    expect(views).toHaveLength(2);
    expect(views.find((v) => v.name === 'urgentes de SETEMBRO')!.filters.priority).toBe('alta');
    await deleteView(views[0]!.id);
    expect(await listViews()).toHaveLength(1);
    await expect(saveView('   ', EMPTY_FILTERS)).rejects.toThrow(/nome/);
    expect(isInternational(newCase({ answers: { ...emptyAnswers(), foreignCountries: ['Suíça'] } }))).toBe(true);
    expect(isInternational(newCase())).toBe(false);
    expect(await db.settings.get('savedViews')).toBeTruthy();
  });
});
