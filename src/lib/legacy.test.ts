import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db, emptyAnswers } from './db';
import { importLegacy, mapAnswers, matchTask, parseLegacy } from './legacy';
import { newTask } from './db';

const LEGACY = {
  cases: [
    {
      id: '1700000000000',
      name: 'Sucessão Família Teste',
      death: '2026-02-10',
      responsible: 'Ana Marques',
      answers: {
        deathPlace: 'Estrangeiro',
        nationality: 'Portuguesa',
        residence: 'França',
        spouse: 'Sim',
        descendants: 'Sim',
        ascendants: 'Não',
        others: 'A confirmar',
        will: 'Desconhecido',
        habilitation: 'Necessária',
        assets: ['Imóveis', 'Contas bancárias', 'Património no estrangeiro'],
        liabilities: 'A confirmar',
        partition: 'Boas perspetivas de acordo',
      },
      tasks: { t0: 'green', t1: 'orange', t2: 'red', t9: 'grey' },
      info: {
        t0: { phase: 0, text: 'Recolher documentação inicial e confirmar dados do óbito' },
        t1: { phase: 0, text: 'Preparar procuração — pontapé de saída do dossier', critical: true },
        t2: { phase: 0, text: 'Verificar registo/transcrição do óbito em Portugal', critical: true },
        t9: { phase: 4, text: 'Tarefa muito específica do protótipo que não existe no motor' },
      },
      interested: [
        { name: 'Maria Teste', quality: 'Cônjuge', nationality: 'Portuguesa', birth: '', civil: 'Casada', regime: 'Comunhão de adquiridos', nif: '', id: '', address: '', email: 'maria@example.com', phone: '', poa: 'Recebida', notes: '' },
        { name: 'Pedro Teste', quality: 'Herdeiro', nationality: '', birth: '', civil: '', regime: '', nif: '', id: '', address: '', email: '', phone: '', poa: 'A pedir', notes: 'Vive em Lyon' },
      ],
      assetsData: [
        { type: 'Imóveis', description: 'Apartamento T2 Lisboa', holder: 'De cujus', country: 'Portugal', value: '185000', notes: '' },
        { type: 'Património no estrangeiro', description: 'Conta Crédit Agricole', holder: '', country: 'França', value: '12.500,50', notes: '' },
      ],
    },
  ],
  notes: {
    client: { name: 'Pedro Teste', email: 'pedro@example.com', phone: '+33 6 00', country: 'França', preferred: 'Email', address: 'Lyon' },
    important: 'Cliente prefere contacto por email.',
    general: 'Observações gerais.',
    logs: [{ date: '2026-03-01', person: 'Pedro Teste', role: 'Herdeiro', channel: 'Email', note: 'Enviou certidões.' }],
  },
};

describe('importação do protótipo', () => {
  it('converte as respostas do protótipo para o questionário atual', () => {
    const a = mapAnswers(LEGACY.cases[0]!.answers, emptyAnswers());
    expect(a.deathPlace).toBe('estrangeiro');
    expect(a.deathCountry).toBe('França');
    expect(a.nationality).toBe('portuguesa');
    expect(a.habitualResidence).toBe('franca');
    expect(a.spouse).toBe('casado');
    expect(a.descendants).toBe('sim');
    expect(a.ascendants).toBe('nao');
    expect(a.others).toBe('a_confirmar');
    expect(a.will).toBe('desconhecido');
    expect(a.habilitation).toBe('necessaria');
    expect(a.assets).toEqual(['imoveis', 'contas', 'estrangeiro']);
    expect(a.foreignCountries).toEqual(['França']);
    expect(a.liabilities).toBe('a_confirmar');
    expect(a.partition).toBe('boas_perspetivas');
    expect(a.regime).toBe(''); // o protótipo não perguntava
  });

  it('casa tarefas do protótipo com as geradas por título', () => {
    const tasks = [newTask('c', { title: 'Verificar registo/transcrição do óbito em Portugal' }), newTask('c', { title: 'Preparar procuração forense — ponto de partida do dossier' })];
    expect(matchTask('Verificar registo/transcrição do óbito em Portugal', tasks)?.id).toBe(tasks[0]!.id);
    expect(matchTask('Preparar procuração — pontapé de saída do dossier', tasks)?.id).toBe(tasks[1]!.id);
    expect(matchTask('Coisa inexistente', tasks)).toBeUndefined();
  });

  it('importa dossiers, estados, interessados, bens, cliente, notas e contactos', async () => {
    const payload = parseLegacy(JSON.stringify(LEGACY));
    const r = await importLegacy(payload);
    expect(r.cases).toBe(1);
    expect(r.parties).toBe(2);
    expect(r.assets).toBe(2);
    expect(r.contacts).toBe(1);
    expect(r.tasksMatched).toBeGreaterThanOrEqual(2);
    expect(r.tasksAdded).toBe(1);

    const c = (await db.cases.toArray()).find((x) => x.tags.includes('Importado'))!;
    expect(c.name).toBe('Sucessão Família Teste');
    expect(c.deceased.deathDate).toBe('2026-02-10');
    expect(c.client.name).toBe('Pedro Teste');
    expect(c.client.preferred).toBe('email');
    expect(c.generalNotes).toBe('Observações gerais.');
    const member = (await db.members.toArray()).find((m) => m.name === 'Ana Marques');
    expect(member).toBeDefined();
    expect(c.responsibleId).toBe(member!.id);

    const tasks = await db.tasks.where('caseId').equals(c.id).toArray();
    expect(tasks.some((t) => t.title.startsWith('Verificar registo/transcrição') && t.status === 'pendente')).toBe(true);
    const added = tasks.find((t) => t.title.startsWith('Tarefa muito específica'))!;
    expect(added.status).toBe('na');
    expect(added.phase).toBe('internacional');
    expect(added.ruleKey).toBeUndefined();

    const parties = await db.parties.where('caseId').equals(c.id).toArray();
    const maria = parties.find((p) => p.name === 'Maria Teste')!;
    expect(maria.roles).toEqual(['conjuge']);
    expect(maria.kinship).toBe('conjuge');
    expect(maria.poa).toBe('recebida');
    expect(parties.find((p) => p.name === 'Pedro Teste')!.poa).toBe('a_pedir');

    const assets = await db.assets.where('caseId').equals(c.id).toArray();
    expect(assets.find((a) => a.type === 'imoveis')!.value).toBe(185000);
    const foreign = assets.find((a) => a.description === 'Conta Crédit Agricole')!;
    expect(foreign.country).toBe('França');
    expect(foreign.value).toBe(12500.5);

    expect((await db.notes.where('caseId').equals(c.id).toArray())[0]!.pinned).toBe(true);
    const log = (await db.contacts.where('caseId').equals(c.id).toArray())[0]!;
    expect(log.channel).toBe('email');
    expect(log.role).toBe('herdeiro');
  });

  it('rejeita conteúdos que não são do protótipo', () => {
    expect(() => parseLegacy('nope')).toThrow(/JSON/);
    expect(() => parseLegacy('{"app":"balcao-das-sucessoes","tables":{}}')).toThrow(/cases/);
    expect(() => parseLegacy('{"cases":[{"name":"x"}]}')).toThrow(/vazia|formato/);
  });
});
