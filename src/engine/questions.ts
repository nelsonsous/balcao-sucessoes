// Questionário sucessório: "perguntas certas → dossier certo".
import type { Answers } from '../lib/types';

export type StepId = 'obito' | 'familia' | 'disposicoes' | 'patrimonio' | 'partilha';

export interface StepDef {
  id: StepId;
  label: string;
  description: string;
}

export const STEPS: StepDef[] = [
  { id: 'obito', label: 'Óbito e conexões', description: 'Onde ocorreu o óbito e que ligações internacionais existem.' },
  { id: 'familia', label: 'Família', description: 'Quem pode ser chamado à sucessão.' },
  { id: 'disposicoes', label: 'Disposições', description: 'Testamento, liberalidades e habilitação.' },
  { id: 'patrimonio', label: 'Património e passivo', description: 'O que existe, o que se deve e o que falta apurar.' },
  { id: 'partilha', label: 'Partilha', description: 'Perspetiva atual de acordo entre os interessados.' },
];

export interface QOption {
  value: string;
  label: string;
}

export interface Question {
  id: keyof Answers;
  step: StepId;
  label: string;
  help?: string;
  type: 'single' | 'multi' | 'number' | 'country' | 'countries';
  options?: QOption[];
  /** Nas perguntas de escolha múltipla: valores que excluem os restantes. */
  exclusive?: string[];
  visible?: (a: Answers) => boolean;
}

const TRI: QOption[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'desconhecido', label: 'Desconhecido' },
];

export const COUNTRIES = [
  'França',
  'Suíça',
  'Luxemburgo',
  'Alemanha',
  'Espanha',
  'Bélgica',
  'Reino Unido',
  'Países Baixos',
  'Brasil',
  'Estados Unidos',
  'Canadá',
  'Angola',
  'Moçambique',
  'Venezuela',
  'África do Sul',
  'Outro',
];

export const QUESTIONS: Question[] = [
  // ---- Óbito e conexões
  {
    id: 'deathPlace',
    step: 'obito',
    label: 'Onde ocorreu o óbito?',
    type: 'single',
    options: [
      { value: 'portugal', label: 'Portugal' },
      { value: 'estrangeiro', label: 'Estrangeiro' },
    ],
  },
  {
    id: 'deathCountry',
    step: 'obito',
    label: 'Em que país?',
    type: 'country',
    visible: (a) => a.deathPlace === 'estrangeiro',
  },
  {
    id: 'nationality',
    step: 'obito',
    label: 'Nacionalidade do de cujus?',
    type: 'single',
    options: [
      { value: 'portuguesa', label: 'Portuguesa' },
      { value: 'francesa', label: 'Francesa' },
      { value: 'outra_ue', label: 'Outra (UE)' },
      { value: 'outra', label: 'Outra (fora da UE)' },
    ],
  },
  {
    id: 'habitualResidence',
    step: 'obito',
    label: 'Residência habitual à data do óbito?',
    help: 'Em regra, é a lei da residência habitual que rege a sucessão (Reg. (UE) n.º 650/2012, art. 21.º).',
    type: 'single',
    options: [
      { value: 'portugal', label: 'Portugal' },
      { value: 'franca', label: 'França' },
      { value: 'outro_ue', label: 'Outro país da UE' },
      { value: 'fora_ue', label: 'Fora da UE' },
      { value: 'desconhecida', label: 'Desconhecida' },
    ],
  },

  // ---- Família
  {
    id: 'spouse',
    step: 'familia',
    label: 'Havia cônjuge ou unido de facto?',
    help: 'O unido de facto não é herdeiro legal, mas tem direitos próprios (Lei n.º 7/2001).',
    type: 'single',
    options: [
      { value: 'casado', label: 'Cônjuge' },
      { value: 'uniao_facto', label: 'União de facto' },
      { value: 'nao', label: 'Não' },
      { value: 'desconhecido', label: 'Desconhecido' },
    ],
  },
  {
    id: 'regime',
    step: 'familia',
    label: 'Regime de bens do casamento?',
    help: 'Nos regimes de comunhão, o cônjuge tem direito à meação antes da partilha da herança.',
    type: 'single',
    visible: (a) => a.spouse === 'casado',
    options: [
      { value: 'comunhao_adquiridos', label: 'Comunhão de adquiridos' },
      { value: 'comunhao_geral', label: 'Comunhão geral' },
      { value: 'separacao', label: 'Separação de bens' },
      { value: 'desconhecido', label: 'Desconhecido' },
    ],
  },
  {
    id: 'separated',
    step: 'familia',
    label: 'Havia separação de pessoas e bens ou divórcio pendente?',
    help: 'O cônjuge separado judicialmente de pessoas e bens não é chamado à sucessão; na pendência de divórcio, os herdeiros podem prosseguir a ação para efeitos patrimoniais.',
    type: 'single',
    visible: (a) => a.spouse === 'casado',
    options: TRI,
  },
  { id: 'descendants', step: 'familia', label: 'Havia descendentes?', type: 'single', options: TRI },
  {
    id: 'descendantsCount',
    step: 'familia',
    label: 'Quantos filhos (incluindo pré-falecidos)?',
    type: 'number',
    visible: (a) => a.descendants === 'sim',
  },
  {
    id: 'representation',
    step: 'familia',
    label: 'Algum filho faleceu antes, deixando descendentes?',
    help: 'Os netos são chamados por direito de representação (arts. 2039.º e ss. do Código Civil).',
    type: 'single',
    options: TRI,
    visible: (a) => a.descendants === 'sim',
  },
  {
    id: 'ascendants',
    step: 'familia',
    label: 'Havia ascendentes vivos (pais, avós)?',
    help: 'Só são chamados na falta de descendentes (art. 2134.º do Código Civil).',
    type: 'single',
    options: TRI,
    visible: (a) => a.descendants !== 'sim',
  },
  {
    id: 'siblings',
    step: 'familia',
    label: 'Havia irmãos ou sobrinhos?',
    help: '3.ª classe de sucessíveis, chamada apenas na falta de cônjuge, descendentes e ascendentes.',
    type: 'single',
    options: TRI,
    visible: (a) => a.spouse !== 'casado' && a.descendants !== 'sim' && a.ascendants !== 'sim',
  },
  {
    id: 'incapable',
    step: 'familia',
    label: 'Há menores ou maiores acompanhados entre os interessados?',
    type: 'single',
    options: TRI,
  },
  {
    id: 'heirsAbroad',
    step: 'familia',
    label: 'Há herdeiros a residir no estrangeiro?',
    help: 'Procurações consulares ou apostiladas, NIF português e representante fiscal para não residentes.',
    type: 'single',
    options: TRI,
  },
  {
    id: 'unknownHeirs',
    step: 'familia',
    label: 'Há herdeiros de paradeiro desconhecido?',
    help: 'Diligências de localização, citação edital e eventual curadoria de ausentes.',
    type: 'single',
    options: TRI,
  },
  {
    id: 'others',
    step: 'familia',
    label: 'Outros interessados na sucessão?',
    help: 'Legatários, credores, beneficiários, cessionários…',
    type: 'single',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'a_confirmar', label: 'A confirmar' },
    ],
  },

  // ---- Disposições
  { id: 'will', step: 'disposicoes', label: 'Há testamento?', type: 'single', options: TRI },
  {
    id: 'gifts',
    step: 'disposicoes',
    label: 'Houve doações em vida a herdeiros?',
    help: 'Relevante para a colação e para o cálculo da legítima.',
    type: 'single',
    options: TRI,
  },
  {
    id: 'insurance',
    step: 'disposicoes',
    label: 'Seguros de vida ou PPR com beneficiários designados?',
    type: 'single',
    options: TRI,
  },
  {
    id: 'habilitation',
    step: 'disposicoes',
    label: 'Habilitação de herdeiros',
    type: 'single',
    options: [
      { value: 'necessaria', label: 'Necessária' },
      { value: 'nao_necessaria', label: 'Não necessária' },
      { value: 'a_confirmar', label: 'A confirmar' },
    ],
  },

  // ---- Património e passivo
  {
    id: 'assets',
    step: 'patrimonio',
    label: 'Que património é conhecido?',
    help: 'Pode selecionar várias opções. "Ainda não sabemos" é uma situação de pesquisa, não um ativo.',
    type: 'multi',
    exclusive: ['desconhecido'],
    options: [
      { value: 'imoveis', label: 'Imóveis' },
      { value: 'contas', label: 'Contas bancárias' },
      { value: 'participacoes', label: 'Participações sociais' },
      { value: 'veiculos', label: 'Veículos' },
      { value: 'aforro', label: 'Certificados de Aforro / Tesouro' },
      { value: 'estrangeiro', label: 'Património no estrangeiro' },
      { value: 'outro', label: 'Outro' },
      { value: 'desconhecido', label: 'Ainda não sabemos' },
    ],
  },
  {
    id: 'foreignCountries',
    step: 'patrimonio',
    label: 'Em que países há património?',
    type: 'countries',
    visible: (a) => a.assets.includes('estrangeiro'),
  },
  {
    id: 'familyHome',
    step: 'patrimonio',
    label: 'A casa de morada de família integra a herança?',
    type: 'single',
    options: TRI,
    visible: (a) => (a.spouse === 'casado' || a.spouse === 'uniao_facto') && a.assets.includes('imoveis'),
  },
  {
    id: 'liabilities',
    step: 'patrimonio',
    label: 'Passivo',
    help: 'Dívidas do de cujus, créditos hipotecários, impostos em falta…',
    type: 'single',
    options: [
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'a_confirmar', label: 'A confirmar' },
    ],
  },
  {
    id: 'insolvencyRisk',
    step: 'patrimonio',
    label: 'O passivo pode superar o ativo?',
    type: 'single',
    options: TRI,
    visible: (a) => a.liabilities === 'sim' || a.liabilities === 'a_confirmar',
  },
  {
    id: 'socialSecurity',
    step: 'patrimonio',
    label: 'Há prestações por morte a requerer (subsídio por morte, pensão de sobrevivência)?',
    type: 'single',
    options: TRI,
  },

  // ---- Partilha
  {
    id: 'partition',
    step: 'partilha',
    label: 'Perspetiva atual da partilha?',
    type: 'single',
    options: [
      { value: 'acordo', label: 'Acordo alcançado' },
      { value: 'boas_perspetivas', label: 'Boas perspetivas de acordo' },
      { value: 'negociacao', label: 'Acordo em negociação' },
      { value: 'conflito', label: 'Sem acordo / conflito' },
      { value: 'indeterminado', label: 'Ainda não determinado' },
    ],
  },
];

export function visibleQuestions(a: Answers, step?: StepId): Question[] {
  return QUESTIONS.filter((q) => (!step || q.step === step) && (!q.visible || q.visible(a)));
}

/** Rótulo legível da resposta dada a uma pergunta. */
export function answerLabel(q: Question, a: Answers): string {
  const v = a[q.id];
  if (Array.isArray(v)) {
    if (!v.length) return '—';
    if (q.type === 'countries') return v.join(', ');
    return v.map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join(', ');
  }
  if (!v) return '—';
  if (q.type === 'number' || q.type === 'country') return String(v);
  return q.options?.find((o) => o.value === v)?.label ?? String(v);
}

/** Percentagem de perguntas visíveis respondidas. */
export function completion(a: Answers): { answered: number; total: number } {
  const qs = visibleQuestions(a);
  const answered = qs.filter((q) => {
    const v = a[q.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }).length;
  return { answered, total: qs.length };
}

/** Limpa respostas que ficaram ocultas por alteração de uma resposta anterior. */
export function pruneHidden(a: Answers): Answers {
  const out: Answers = { ...a };
  for (const q of QUESTIONS) {
    if (q.visible && !q.visible(out)) {
      const cur = out[q.id];
      (out as unknown as Record<string, unknown>)[q.id] = Array.isArray(cur) ? [] : '';
    }
  }
  return out;
}
