// Dados de demonstração — informação 100% fictícia.
import { HolidayCalendar } from '../engine/calendar';
import { syncCaseTasks } from '../engine/sync';
import {
  db,
  deleteCaseCascade,
  emptyAnswers,
  newAsset,
  newCase,
  newDebt,
  newEvent,
  newParty,
} from './db';
import type {
  Answers,
  AssetRecord,
  CaseRecord,
  ContactLogRecord,
  DebtRecord,
  EventRecord,
  MemberRecord,
  PartyRecord,
  Status,
} from './types';
import { nowIso, todayIso, uid } from './utils';

const daysAgo = (n: number): string => todayIso(new Date(Date.now() - n * 86_400_000));
const daysAhead = (n: number): string => todayIso(new Date(Date.now() + n * 86_400_000));
const workCalendar = new HolidayCalendar();
/** Data futura ajustada ao primeiro dia útil (escrituras e reuniões não calham ao fim de semana). */
const workdayAhead = (n: number): string => workCalendar.nextBusinessDay(daysAhead(n));

const MEMBERS: MemberRecord[] = [
  { id: 'demo-ana', name: 'Ana Marques', role: 'Advogada', color: '#2d39b9', createdAt: nowIso() },
  { id: 'demo-joana', name: 'Joana Pires', role: 'Advogada', color: '#0b7a5e', createdAt: nowIso() },
  { id: 'demo-rita', name: 'Rita Sousa', role: 'Solicitadora', color: '#b4531f', createdAt: nowIso() },
];

interface DemoCase {
  c: CaseRecord;
  parties: Array<Partial<PartyRecord>>;
  assets: Array<Partial<AssetRecord>>;
  debts: Array<Partial<DebtRecord>>;
  notes: Array<{ text: string; pinned: boolean }>;
  contacts: Array<Omit<ContactLogRecord, 'id' | 'caseId' | 'createdAt'>>;
  statuses: Record<string, Status>;
  defaultStatus?: Status;
  events?: Array<Partial<EventRecord>>;
}

function answers(p: Partial<Answers>): Answers {
  return { ...emptyAnswers(), ...p };
}

function demoCases(): DemoCase[] {
  return [
    {
      c: newCase({
        ref: 'BS-DEMO-001',
        name: 'Sucessão Dupont-Silva',
        demo: true,
        priority: 'alta',
        responsibleId: 'demo-ana',
        tags: ['França', 'Imóveis'],
        deceased: {
          name: 'Maria Helena Dupont Silva',
          nif: '',
          birthDate: '1951-03-08',
          deathDate: daysAgo(75),
          deathCity: 'Lyon',
          lastAddress: 'Lyon, França',
        },
        client: {
          name: 'Jean Dupont',
          email: 'exemplo@cliente.pt',
          phone: '+33 6 00 00 00 00',
          country: 'França',
          preferred: 'email',
          address: 'Lyon, França',
        },
        answers: answers({
          deathPlace: 'estrangeiro',
          deathCountry: 'França',
          nationality: 'portuguesa',
          habitualResidence: 'franca',
          spouse: 'casado',
          regime: 'comunhao_adquiridos',
          descendants: 'sim',
          descendantsCount: '2',
          representation: 'nao',
          incapable: 'nao',
          others: 'nao',
          will: 'desconhecido',
          gifts: 'nao',
          insurance: 'sim',
          habilitation: 'necessaria',
          assets: ['imoveis', 'contas', 'estrangeiro'],
          foreignCountries: ['França'],
          familyHome: 'sim',
          liabilities: 'nao',
          socialSecurity: 'sim',
          partition: 'boas_perspetivas',
        }),
        generalNotes: 'Cliente viaja para Portugal em outubro — aproveitar para assinar a habilitação.',
      }),
      parties: [
        {
          name: 'Jean Dupont',
          roles: ['conjuge', 'herdeiro'],
          kinship: 'conjuge',
          isHeadOfEstate: true,
          isClient: true,
          nationality: 'Francesa',
          civilStatus: 'Casado',
          regime: 'Comunhão de adquiridos',
          email: 'exemplo@cliente.pt',
          phone: '+33 6 00 00 00 00',
          poa: 'recebida',
          acceptance: 'aceitou',
        },
        { name: 'Sophie Dupont Silva', roles: ['herdeiro'], kinship: 'filho', nationality: 'Francesa', poa: 'pedida' },
        { name: 'Lucas Dupont Silva', roles: ['herdeiro'], kinship: 'filho', nationality: 'Portuguesa', poa: 'a_pedir' },
      ],
      assets: [
        {
          type: 'imoveis',
          description: 'Apartamento T3 — Lisboa (casa de morada de família)',
          ownership: 'comum',
          value: 185_000,
          valueBasis: 'vpt',
          matrixArticle: 'U-1234',
          parish: 'Arroios',
          status: 'documentado',
        },
        {
          type: 'imoveis',
          description: 'Moradia — Lyon',
          country: 'França',
          ownership: 'comum',
          value: 320_000,
          valueBasis: 'estimado',
        },
        {
          type: 'contas',
          description: 'Conta à ordem e depósito a prazo',
          bank: 'Banco Exemplo',
          iban: 'PT50000000000000000000000',
          ownership: 'comum',
          value: 23_450.12,
          valueBasis: 'saldo',
        },
        { type: 'contas', description: 'Compte courant', bank: 'Banque Exemple', country: 'França', value: 8_200, valueBasis: 'saldo' },
      ],
      debts: [],
      notes: [
        { text: 'Documentação original a aguardar.', pinned: true },
        { text: 'Cliente prefere contacto por email.', pinned: true },
        { text: 'Património também em França.', pinned: true },
      ],
      contacts: [
        { date: daysAgo(5), person: 'Jean Dupont', role: 'conjuge', channel: 'email', summary: 'Enviada lista de documentos em falta.', followUp: daysAhead(3), followUpDone: false },
        { date: daysAgo(7), person: 'Banco Exemplo', role: 'outro', channel: 'telefone', summary: 'Pedido de declaração de saldos em análise.', followUp: daysAhead(7), followUpDone: false },
        { date: daysAgo(11), person: 'Notaire — Lyon', role: 'outro', channel: 'email', summary: 'Primeiro contacto; pediu certidões.', followUp: '', followUpDone: false },
        { date: daysAgo(15), person: 'Jean Dupont', role: 'conjuge', channel: 'reuniao', summary: 'Reunião de arranque do dossier.', followUp: '', followUpDone: false },
      ],
      events: [
        { title: 'Videochamada com Jean Dupont — ponto de situação', kind: 'reuniao', date: workdayAhead(3), time: '10:00', endTime: '10:45', location: 'Videochamada' },
        { title: 'Escritura de habilitação de herdeiros', kind: 'escritura', date: workdayAhead(23), time: '11:30', endTime: '12:30', location: 'Cartório Notarial (Lisboa)' },
      ],
      statuses: {
        'obito-certidao': 'concluido',
        procuracao: 'concluido',
        kyc: 'concluido',
        'cabeca-casal': 'concluido',
        'lista-docs-cliente': 'concluido',
        'transcricao-obito': 'em_curso',
        'qualificar-interessados': 'em_curso',
        'conjuge-registo': 'concluido',
        'descendentes-registo': 'em_curso',
        'contas-saldos': 'aguarda',
        'banco-portugal': 'concluido',
        'franca-notaire': 'em_curso',
        'imoveis-docs': 'em_curso',
        'prestacoes-morte': 'aguarda',
        'contratos-cancelar': 'na',
      },
    },
    {
      c: newCase({
        ref: 'BS-DEMO-002',
        name: 'Herança Almeida Rocha',
        demo: true,
        priority: 'urgente',
        responsibleId: 'demo-joana',
        tags: ['Conflito', 'Sociedade'],
        deceased: {
          name: 'Manuel Almeida Rocha',
          nif: '',
          birthDate: '1940-11-21',
          deathDate: daysAgo(160),
          deathCity: 'Porto',
          lastAddress: 'Porto',
        },
        client: {
          name: 'Beatriz Almeida Rocha',
          email: 'beatriz@exemplo.pt',
          phone: '+351 910 000 000',
          country: 'Portugal',
          preferred: 'telefone',
          address: 'Porto',
        },
        answers: answers({
          deathPlace: 'portugal',
          nationality: 'portuguesa',
          habitualResidence: 'portugal',
          spouse: 'nao',
          descendants: 'sim',
          descendantsCount: '3',
          representation: 'sim',
          incapable: 'sim',
          others: 'sim',
          will: 'sim',
          gifts: 'sim',
          insurance: 'nao',
          habilitation: 'necessaria',
          assets: ['imoveis', 'participacoes', 'veiculos', 'contas'],
          liabilities: 'sim',
          insolvencyRisk: 'nao',
          socialSecurity: 'nao',
          partition: 'conflito',
        }),
        generalNotes: 'Relação tensa entre os irmãos — comunicações sempre por escrito.',
      }),
      parties: [
        { name: 'Beatriz Almeida Rocha', roles: ['herdeiro'], kinship: 'filho', isClient: true, isHeadOfEstate: true, poa: 'recebida', acceptance: 'aceitou', phone: '+351 910 000 000' },
        { name: 'António Almeida Rocha', roles: ['herdeiro'], kinship: 'filho', acceptance: 'por_definir' },
        { name: 'Tomás Rocha Pinto', roles: ['herdeiro'], kinship: 'neto', isMinor: true, notes: 'Representa o pai (filho pré-falecido do de cujus).' },
        { name: 'Carla Pinto', roles: ['representante'], kinship: 'sem_parentesco', notes: 'Mãe e representante legal do Tomás.' },
        { name: 'Associação Exemplo de Solidariedade', kind: 'coletiva', roles: ['legatario'], kinship: 'sem_parentesco', notes: 'Legado de 10 000 € em testamento.' },
      ],
      assets: [
        { type: 'imoveis', description: 'Prédio urbano — Porto', ownership: 'proprio', value: 240_000, valueBasis: 'vpt', matrixArticle: 'U-5678', parish: 'Bonfim', status: 'avaliado' },
        { type: 'participacoes', description: 'Quota de 50% — Rocha & Filhos, Lda.', company: 'Rocha & Filhos, Lda.', capitalPct: '50', ownership: 'proprio', value: 150_000, valueBasis: 'estimado' },
        { type: 'veiculos', description: 'Automóvel ligeiro', plate: 'AA-00-AA', ownership: 'proprio', value: 12_000, valueBasis: 'mercado' },
        { type: 'contas', description: 'Contas à ordem e poupança', bank: 'Banco Exemplo', ownership: 'proprio', value: 54_300, valueBasis: 'saldo', status: 'documentado' },
      ],
      debts: [
        { creditor: 'Banco Exemplo', description: 'Crédito habitação (prédio do Porto)', amount: 38_200, guarantee: 'Hipoteca', status: 'confirmado' },
        { creditor: 'Autoridade Tributária', description: 'IMI em dívida', amount: 610, status: 'por_confirmar' },
      ],
      notes: [{ text: 'Testamento deixa legado à associação — confirmar respeito pela legítima.', pinned: true }],
      contacts: [
        { date: daysAgo(3), person: 'António Almeida Rocha', role: 'herdeiro', channel: 'carta', summary: 'Recusou proposta de partilha.', followUp: daysAhead(10), followUpDone: false },
        { date: daysAgo(20), person: 'Carla Pinto', role: 'representante', channel: 'reuniao', summary: 'Explicada a necessidade de curador especial.', followUp: '', followUpDone: false },
      ],
      events: [
        { title: 'Prazo para responder à reclamação do irmão', kind: 'prazo', date: workdayAhead(5) },
        { title: 'Conferência de interessados', kind: 'diligencia', date: workdayAhead(9), time: '14:00', endTime: '15:30', location: 'Cartório Notarial (Porto)' },
      ],
      statuses: {
        'obito-certidao': 'concluido',
        procuracao: 'concluido',
        kyc: 'concluido',
        'cabeca-casal': 'concluido',
        'lista-docs-cliente': 'concluido',
        'qualificar-interessados': 'concluido',
        'descendentes-registo': 'concluido',
        representacao: 'concluido',
        'representacao-incapazes': 'em_curso',
        'outros-interessados': 'concluido',
        'aceitacao-repudio': 'em_curso',
        'testamento-obter': 'concluido',
        legitima: 'em_curso',
        'doacoes-apurar': 'em_curso',
        habilitacao: 'concluido',
        'habilitacao-agendar': 'concluido',
        'imoveis-docs': 'concluido',
        'contas-saldos': 'concluido',
        'banco-portugal': 'concluido',
        'participacoes-pacto': 'em_curso',
        'veiculos-docs': 'concluido',
        'passivo-comprovar': 'concluido',
        encargos: 'concluido',
        'contratos-cancelar': 'concluido',
        'relacao-bens': 'em_curso',
        inventario: 'em_curso',
      },
    },
    {
      c: newCase({
        ref: 'BS-DEMO-003',
        name: 'Sucessão Teixeira Lopes',
        demo: true,
        priority: 'normal',
        responsibleId: 'demo-ana',
        tags: ['Acordo'],
        deceased: {
          name: 'Luísa Teixeira Lopes',
          nif: '',
          birthDate: '1968-06-02',
          deathDate: daysAgo(330),
          deathCity: 'Coimbra',
          lastAddress: 'Coimbra',
        },
        client: { name: 'Rui Teixeira Lopes', email: 'rui@exemplo.pt', phone: '', country: 'Portugal', preferred: 'email', address: 'Coimbra' },
        answers: answers({
          deathPlace: 'portugal',
          nationality: 'portuguesa',
          habitualResidence: 'portugal',
          spouse: 'casado',
          regime: 'separacao',
          descendants: 'nao',
          ascendants: 'sim',
          incapable: 'nao',
          others: 'nao',
          will: 'nao',
          gifts: 'nao',
          insurance: 'nao',
          habilitation: 'necessaria',
          assets: ['contas', 'aforro'],
          liabilities: 'nao',
          socialSecurity: 'sim',
          partition: 'acordo',
        }),
        generalNotes: '',
      }),
      parties: [
        { name: 'Rui Teixeira Lopes', roles: ['conjuge', 'herdeiro'], kinship: 'conjuge', isClient: true, isHeadOfEstate: true, poa: 'recebida', acceptance: 'aceitou' },
        { name: 'Fernanda Lopes', roles: ['herdeiro'], kinship: 'progenitor', poa: 'recebida', acceptance: 'aceitou' },
      ],
      assets: [
        { type: 'contas', description: 'Depósitos a prazo', bank: 'Banco Exemplo', ownership: 'proprio', value: 61_000, valueBasis: 'saldo', status: 'avaliado' },
        { type: 'aforro', description: 'Certificados de Aforro — Série F', ownership: 'proprio', value: 15_500, valueBasis: 'nominal', status: 'avaliado' },
      ],
      debts: [],
      notes: [{ text: 'Partilha acordada: 2/3 cônjuge, 1/3 mãe.', pinned: true }],
      contacts: [
        { date: daysAgo(2), person: 'Rui Teixeira Lopes', role: 'conjuge', channel: 'email', summary: 'Confirmou data da escritura.', followUp: daysAhead(12), followUpDone: false },
      ],
      events: [{ title: 'Escritura de partilha', kind: 'escritura', date: workdayAhead(12), time: '10:00', endTime: '11:00', location: 'Cartório Notarial (Coimbra)' }],
      statuses: {
        'agendar-partilha': 'em_curso',
        'contas-movimentar': 'pendente',
        'obrigacoes-finais': 'pendente',
        arquivar: 'pendente',
        'contratos-cancelar': 'na',
      },
      defaultStatus: 'concluido',
    },
    {
      c: newCase({
        ref: 'BS-DEMO-004',
        name: 'Sucessão Correia Mendes',
        demo: true,
        priority: 'normal',
        responsibleId: 'demo-rita',
        tags: ['Novo'],
        deceased: {
          name: 'Joaquim Correia Mendes',
          nif: '',
          birthDate: '',
          deathDate: daysAgo(20),
          deathCity: 'Lisboa',
          lastAddress: '',
        },
        client: { name: 'Paula Correia', email: '', phone: '+351 930 000 000', country: 'Portugal', preferred: 'telefone', address: '' },
        answers: answers({
          deathPlace: 'portugal',
          nationality: 'portuguesa',
          habitualResidence: 'portugal',
          spouse: 'desconhecido',
          descendants: 'desconhecido',
          ascendants: 'desconhecido',
          siblings: 'desconhecido',
          incapable: 'desconhecido',
          others: 'a_confirmar',
          will: 'desconhecido',
          gifts: 'desconhecido',
          insurance: 'desconhecido',
          habilitation: 'a_confirmar',
          assets: ['desconhecido'],
          liabilities: 'a_confirmar',
          insolvencyRisk: 'desconhecido',
          socialSecurity: 'desconhecido',
          partition: 'indeterminado',
        }),
        generalNotes: 'Primeira reunião marcada. Cliente é sobrinha do de cujus.',
      }),
      parties: [{ name: 'Paula Correia', roles: ['a_confirmar'], kinship: 'sobrinho', isClient: true, phone: '+351 930 000 000' }],
      assets: [],
      debts: [],
      notes: [],
      contacts: [
        { date: daysAgo(1), person: 'Paula Correia', role: 'a_confirmar', channel: 'telefone', summary: 'Pedido de marcação de reunião.', followUp: daysAhead(2), followUpDone: false },
      ],
      events: [{ title: 'Primeira reunião com Paula Correia', kind: 'reuniao', date: workdayAhead(2), time: '16:00', endTime: '17:00', location: 'Escritório' }],
      statuses: { 'obito-certidao': 'em_curso' },
    },
    {
      c: newCase({
        ref: 'BS-DEMO-005',
        name: 'Sucessão Ferreira Gomes',
        demo: true,
        priority: 'normal',
        stage: 'concluido',
        responsibleId: 'demo-joana',
        tags: ['Encerrado'],
        deceased: {
          name: 'Artur Ferreira Gomes',
          nif: '',
          birthDate: '1945-01-30',
          deathDate: daysAgo(420),
          deathCity: 'Braga',
          lastAddress: 'Braga',
        },
        client: { name: 'Helena Gomes', email: 'helena@exemplo.pt', phone: '', country: 'Portugal', preferred: 'email', address: 'Braga' },
        answers: answers({
          deathPlace: 'portugal',
          nationality: 'portuguesa',
          habitualResidence: 'portugal',
          spouse: 'casado',
          regime: 'comunhao_adquiridos',
          descendants: 'sim',
          descendantsCount: '1',
          representation: 'nao',
          incapable: 'nao',
          others: 'nao',
          will: 'nao',
          gifts: 'nao',
          insurance: 'nao',
          habilitation: 'necessaria',
          assets: ['imoveis', 'contas'],
          familyHome: 'sim',
          liabilities: 'nao',
          socialSecurity: 'nao',
          partition: 'acordo',
        }),
        generalNotes: '',
      }),
      parties: [
        { name: 'Helena Gomes', roles: ['conjuge', 'herdeiro'], kinship: 'conjuge', isClient: true, isHeadOfEstate: true, poa: 'recebida', acceptance: 'aceitou' },
        { name: 'Pedro Ferreira Gomes', roles: ['herdeiro'], kinship: 'filho', poa: 'recebida', acceptance: 'aceitou' },
      ],
      assets: [
        { type: 'imoveis', description: 'Moradia — Braga', ownership: 'comum', value: 210_000, valueBasis: 'vpt', status: 'partilhado' },
        { type: 'contas', description: 'Conta à ordem', bank: 'Banco Exemplo', ownership: 'comum', value: 18_900, valueBasis: 'saldo', status: 'partilhado' },
      ],
      debts: [],
      notes: [],
      contacts: [],
      statuses: { 'contratos-cancelar': 'na' },
      defaultStatus: 'concluido',
    },
  ];
}

export async function loadDemoData(): Promise<number> {
  await db.members.bulkPut(MEMBERS);
  const list = demoCases();
  for (const d of list) {
    await db.cases.put(d.c);
    await db.parties.bulkPut(d.parties.map((p) => newParty(d.c.id, p)));
    await db.assets.bulkPut(d.assets.map((a) => newAsset(d.c.id, a)));
    await db.debts.bulkPut(d.debts.map((x) => newDebt(d.c.id, x)));
    await db.notes.bulkPut(
      d.notes.map((n, i) => ({
        id: uid(),
        caseId: d.c.id,
        text: n.text,
        pinned: n.pinned,
        createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        updatedAt: nowIso(),
      })),
    );
    await db.contacts.bulkPut(d.contacts.map((x) => ({ ...x, id: uid(), caseId: d.c.id, createdAt: nowIso() })));
    await db.events.bulkPut((d.events ?? []).map((e) => newEvent({ ...e, caseId: d.c.id, assigneeId: d.c.responsibleId })));
    await syncCaseTasks(d.c);

    const tasks = await db.tasks.where('caseId').equals(d.c.id).toArray();
    for (const t of tasks) {
      const st = (t.ruleKey && d.statuses[t.ruleKey]) || d.defaultStatus;
      if (st && st !== t.status) {
        await db.tasks.update(t.id, {
          status: st,
          completedAt: st === 'concluido' ? nowIso() : '',
          assigneeId: d.c.responsibleId,
        });
      }
    }
    await db.activity.bulkPut([
      { id: uid(), caseId: d.c.id, at: d.c.createdAt, kind: 'dossier', text: 'Dossier criado (demonstração)', actor: 'Equipa' },
    ]);
  }
  await db.events.put(
    newEvent({ id: 'demo-ev-equipa', title: 'Reunião de equipa — ponto de situação dos dossiers', kind: 'reuniao', date: workdayAhead(4), time: '09:30', endTime: '10:15', location: 'Sala de reuniões' }),
  );
  return list.length;
}

export async function removeDemoData(): Promise<void> {
  const demo = await db.cases.filter((c) => Boolean(c.demo)).toArray();
  for (const c of demo) await deleteCaseCascade(c.id);
  await db.members.bulkDelete(MEMBERS.map((m) => m.id));
  await db.events.delete('demo-ev-equipa');
}
