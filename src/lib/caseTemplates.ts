// Modelos de dossier: pontos de partida para o questionário (respostas, etiquetas,
// prioridade e tarefas próprias). Os modelos-base cobrem os casos mais frequentes;
// o escritório pode guardar os seus a partir de qualquer dossier.
import type { Answers, CaseRecord, CaseTemplateRecord, CustomTaskSeed, TaskRecord } from './types';
import { emptyAnswers, newCaseTemplate } from './db';

export interface CaseTemplateDef {
  id: string;
  name: string;
  description: string;
  answers: Partial<Answers>;
  tags: string[];
  priority: CaseRecord['priority'];
  tasks: CustomTaskSeed[];
  builtin: boolean;
}

const T = (id: string, name: string, description: string, answers: Partial<Answers>, tags: string[] = [], tasks: CustomTaskSeed[] = []): CaseTemplateDef => ({
  id: `base-${id}`,
  name,
  description,
  answers,
  tags,
  priority: 'normal',
  tasks,
  builtin: true,
});

export const BUILTIN_CASE_TEMPLATES: CaseTemplateDef[] = [
  T(
    'conjuge-filhos',
    'Cônjuge e filhos, tudo em Portugal',
    'Sucessão legítima corrente: casado em comunhão de adquiridos, filhos maiores, sem testamento, casa de morada de família, contas e imóveis em Portugal.',
    {
      deathPlace: 'portugal',
      nationality: 'portuguesa',
      habitualResidence: 'portugal',
      spouse: 'casado',
      regime: 'comunhao_adquiridos',
      descendants: 'sim',
      incapable: 'nao',
      ascendants: 'nao',
      others: 'nao',
      will: 'nao',
      gifts: 'nao',
      insurance: 'desconhecido',
      habilitation: 'necessaria',
      assets: ['imoveis', 'contas'],
      familyHome: 'sim',
      liabilities: 'a_confirmar',
      socialSecurity: 'sim',
      partition: 'boas_perspetivas',
    },
    ['Família'],
  ),
  T(
    'sem-descendentes',
    'Sem descendentes: irmãos e sobrinhos',
    'Solteiro(a) ou viúvo(a) sem filhos nem pais vivos: chamada dos irmãos (e sobrinhos por representação), Imposto do Selo a 10 %.',
    {
      deathPlace: 'portugal',
      nationality: 'portuguesa',
      habitualResidence: 'portugal',
      spouse: 'nao',
      descendants: 'nao',
      ascendants: 'nao',
      siblings: 'sim',
      representation: 'desconhecido',
      others: 'nao',
      will: 'desconhecido',
      gifts: 'nao',
      habilitation: 'necessaria',
      assets: ['contas', 'imoveis'],
      liabilities: 'a_confirmar',
      partition: 'indeterminado',
    },
    ['Colaterais'],
  ),
  T(
    'franca',
    'Ligação a França',
    'De cujus com residência habitual ou bens em França: lei aplicável, Certificado Sucessório Europeu, notaire e declaração de sucessão francesa.',
    {
      deathPlace: 'estrangeiro',
      deathCountry: 'França',
      nationality: 'portuguesa',
      habitualResidence: 'franca',
      spouse: 'casado',
      regime: 'desconhecido',
      descendants: 'sim',
      ascendants: 'nao',
      will: 'desconhecido',
      habilitation: 'necessaria',
      assets: ['imoveis', 'contas', 'estrangeiro'],
      foreignCountries: ['França'],
      liabilities: 'a_confirmar',
      partition: 'indeterminado',
    },
    ['França', 'Internacional'],
    [{ title: 'Confirmar com o notaire a lei aplicável e a necessidade de CSE', phase: 'internacional', description: 'Alinhar com o notaire francês a lei escolhida/aplicável (Reg. (UE) 650/2012) e quem pede o Certificado Sucessório Europeu.', critical: false }],
  ),
  T(
    'testamento-menores',
    'Com testamento e herdeiros menores',
    'Testamento a confirmar, descendentes menores com representante legal e autorizações para a partilha.',
    {
      deathPlace: 'portugal',
      nationality: 'portuguesa',
      habitualResidence: 'portugal',
      spouse: 'casado',
      regime: 'comunhao_adquiridos',
      descendants: 'sim',
      incapable: 'sim',
      ascendants: 'desconhecido',
      will: 'sim',
      gifts: 'desconhecido',
      habilitation: 'necessaria',
      assets: ['imoveis', 'contas', 'veiculos'],
      familyHome: 'sim',
      liabilities: 'a_confirmar',
      partition: 'negociacao',
    },
    ['Menores', 'Testamento'],
  ),
];

/** Respostas completas a partir de um modelo (as omitidas ficam por responder). */
export function answersFromTemplate(t: Pick<CaseTemplateDef, 'answers'> | { answers: Answers }): Answers {
  return { ...emptyAnswers(), ...t.answers, assets: [...(t.answers.assets ?? [])], foreignCountries: [...(t.answers.foreignCountries ?? [])] };
}

export const toDef = (r: CaseTemplateRecord): CaseTemplateDef => ({ id: r.id, name: r.name, description: r.description, answers: r.answers, tags: r.tags, priority: r.priority, tasks: r.tasks, builtin: false });

/** Modelo a partir de um dossier existente: respostas, etiquetas, prioridade e tarefas próprias (sem dados pessoais). */
export function templateFromCase(c: CaseRecord, tasks: TaskRecord[], name: string, description = ''): CaseTemplateRecord {
  return newCaseTemplate({
    name: name.trim() || c.name,
    description,
    answers: { ...c.answers, assets: [...c.answers.assets], foreignCountries: [...c.answers.foreignCountries] },
    tags: [...c.tags],
    priority: c.priority,
    tasks: tasks
      .filter((t) => !t.ruleKey && !t.obsolete)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ title: t.title, phase: t.phase, description: t.description, critical: t.critical })),
  });
}

/** Quantas respostas do modelo estão preenchidas (para mostrar "12 respostas"). */
export function answeredCount(a: Partial<Answers>): number {
  return Object.entries(a).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== undefined)).length;
}
