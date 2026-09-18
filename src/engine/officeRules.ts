// Regras próprias do escritório (puro, sem base de dados): condições sobre as
// respostas do questionário → tarefas na checklist, com fase, prazo e documentos.
// Complementam a biblioteca de regras; o conteúdo é da responsabilidade da equipa.
import type { Answers, OfficeRuleCondition, OfficeRuleOp, OfficeRuleRecord, OfficeRuleTask, PhaseId } from '../lib/types';
import type { DeadlineSpec } from './deadlines';
import type { DesiredTask } from './engine';
import { PHASE_INDEX } from './phases';
import { COUNTRIES, QUESTIONS, type QOption, type Question } from './questions';

export const OFFICE_PREFIX = 'office:';

/** Chave da tarefa no dossier: estável enquanto a regra e a tarefa existirem. */
export const officeKey = (ruleId: string, taskKey: string): string => `${OFFICE_PREFIX}${ruleId}:${taskKey}`;
export const isOfficeKey = (key: string | undefined): boolean => Boolean(key?.startsWith(OFFICE_PREFIX));
/** Id da regra a partir da chave da tarefa (ou "" se não for de uma regra do escritório). */
export const ruleIdFromKey = (key: string | undefined): string => (isOfficeKey(key) ? key!.slice(OFFICE_PREFIX.length).split(':')[0] ?? '' : '');

/** Operadores disponíveis por tipo de pergunta. */
export const OPS_BY_TYPE: Record<Question['type'], OfficeRuleOp[]> = {
  single: ['eq', 'neq', 'answered', 'unanswered'],
  country: ['eq', 'neq', 'answered', 'unanswered'],
  multi: ['includes', 'excludes', 'answered', 'unanswered'],
  countries: ['includes', 'excludes', 'answered', 'unanswered'],
  number: ['gte', 'lte', 'eq', 'answered', 'unanswered'],
};

export const OP_LABELS: Record<OfficeRuleOp, string> = {
  eq: 'é',
  neq: 'não é',
  includes: 'inclui',
  excludes: 'não inclui',
  gte: 'é pelo menos',
  lte: 'é no máximo',
  answered: 'está respondida',
  unanswered: 'está por responder',
};

export const opNeedsValue = (op: OfficeRuleOp): boolean => op !== 'answered' && op !== 'unanswered';

/** Nomes curtos das perguntas, para as condições e os resumos. */
export const QUESTION_SHORT: Record<keyof Answers, string> = {
  deathPlace: 'Local do óbito',
  deathCountry: 'País do óbito',
  nationality: 'Nacionalidade',
  habitualResidence: 'Residência habitual',
  spouse: 'Cônjuge ou unido de facto',
  regime: 'Regime de bens',
  separated: 'Separação ou divórcio pendente',
  descendants: 'Descendentes',
  descendantsCount: 'Número de filhos',
  representation: 'Representação (filho pré-falecido)',
  ascendants: 'Ascendentes vivos',
  siblings: 'Irmãos ou sobrinhos',
  incapable: 'Menores ou maiores acompanhados',
  heirsAbroad: 'Herdeiros no estrangeiro',
  unknownHeirs: 'Herdeiros de paradeiro desconhecido',
  others: 'Outros interessados',
  will: 'Testamento',
  gifts: 'Doações em vida',
  insurance: 'Seguros de vida ou PPR',
  habilitation: 'Habilitação de herdeiros',
  assets: 'Património conhecido',
  foreignCountries: 'Países com património',
  familyHome: 'Casa de morada de família',
  liabilities: 'Passivo',
  insolvencyRisk: 'Passivo superior ao ativo',
  socialSecurity: 'Prestações por morte',
  partition: 'Perspetiva da partilha',
};

export const questionById = (id: keyof Answers): Question | undefined => QUESTIONS.find((q) => q.id === id);

/** Valores possíveis de uma pergunta (os países vêm da lista comum). */
export function questionOptions(q: Question): QOption[] {
  if (q.type === 'country' || q.type === 'countries') return COUNTRIES.map((c) => ({ value: c, label: c }));
  return q.options ?? [];
}

/** Condição nova, já válida para a pergunta escolhida (primeiro operador e primeiro valor). */
export function defaultCondition(question: keyof Answers): OfficeRuleCondition {
  const q = questionById(question);
  const op = q ? OPS_BY_TYPE[q.type][0]! : 'eq';
  const value = q && q.type !== 'number' ? (questionOptions(q)[0]?.value ?? '') : '1';
  return { question, op, value };
}

/**
 * Uma condição cumpre-se com as respostas dadas. «Não é» e «não inclui» só se
 * aplicam a perguntas respondidas: sem resposta, nada se presume.
 */
export function conditionHolds(c: OfficeRuleCondition, a: Answers): boolean {
  const raw = a[c.question] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : null;
  const str = list ? '' : String(raw ?? '');
  const answered = list ? list.length > 0 : str !== '';
  switch (c.op) {
    case 'answered':
      return answered;
    case 'unanswered':
      return !answered;
    case 'eq':
      if (list) return list.includes(c.value);
      if (questionById(c.question)?.type === 'number') return answered && Number(str) === Number(c.value);
      return str === c.value;
    case 'includes':
      return list ? list.includes(c.value) : str === c.value;
    case 'neq':
    case 'excludes':
      return answered && (list ? !list.includes(c.value) : str !== c.value);
    case 'gte':
    case 'lte': {
      const n = Number(str);
      const t = Number(c.value);
      if (!answered || !Number.isFinite(n) || !Number.isFinite(t)) return false;
      return c.op === 'gte' ? n >= t : n <= t;
    }
  }
}

/** A regra aplica-se: sem condições aplica-se sempre; senão todas ou qualquer uma. */
export function ruleApplies(r: Pick<OfficeRuleRecord, 'match' | 'conditions'>, a: Answers): boolean {
  if (!r.conditions.length) return true;
  return r.match === 'any' ? r.conditions.some((c) => conditionHolds(c, a)) : r.conditions.every((c) => conditionHolds(c, a));
}

export const DEADLINE_KINDS: Array<{ value: NonNullable<OfficeRuleTask['deadline']>['kind']; label: string }> = [
  { value: 'daysAfter', label: 'dias após o óbito' },
  { value: 'monthsAfter', label: 'meses após o óbito' },
  { value: 'endOfMonthAfter', label: 'fim do mês (N.º mês seguinte ao do óbito)' },
];

/** Prazo da tarefa no formato do motor (com a explicação que aparece na checklist). */
export function deadlineSpec(d: OfficeRuleTask['deadline']): DeadlineSpec | undefined {
  if (!d || !Number.isFinite(d.amount) || d.amount < 1) return undefined;
  const n = Math.round(d.amount);
  const tail = ' (regra do escritório)';
  switch (d.kind) {
    case 'daysAfter':
      return { kind: 'daysAfter', days: n, label: `${n} ${n === 1 ? 'dia' : 'dias'} após o óbito${tail}` };
    case 'monthsAfter':
      return { kind: 'monthsAfter', months: n, label: `${n} ${n === 1 ? 'mês' : 'meses'} após o óbito${tail}` };
    case 'endOfMonthAfter':
      return { kind: 'endOfMonthAfter', months: n, label: `Até ao fim do ${n}.º mês seguinte ao do óbito${tail}` };
  }
}

const byCreation = (x: OfficeRuleRecord, y: OfficeRuleRecord) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id);

/**
 * Tarefas pedidas pelas regras ativas do escritório, no formato do motor. Ficam
 * no fim de cada fase (depois das tarefas da biblioteca), pela ordem de criação.
 */
export function officeDesiredTasks(rules: OfficeRuleRecord[], a: Answers): DesiredTask[] {
  const out: DesiredTask[] = [];
  const perPhase = new Map<PhaseId, number>();
  for (const r of [...rules].sort(byCreation)) {
    if (!r.enabled || !ruleApplies(r, a)) continue;
    const reason = r.reason.trim() || `regra do escritório «${r.name.trim() || 'sem nome'}»`;
    for (const t of r.tasks) {
      if (!t.title.trim()) continue;
      const n = perPhase.get(t.phase) ?? 0;
      perPhase.set(t.phase, n + 1);
      out.push({
        key: officeKey(r.id, t.key),
        ruleId: `${OFFICE_PREFIX}${r.id}`,
        phase: t.phase,
        title: t.title.trim(),
        description: t.description.trim(),
        critical: t.critical,
        initialStatus: 'pendente',
        legal: t.legal.map((x) => x.trim()).filter(Boolean),
        docs: t.docs.map((x) => x.trim()).filter(Boolean),
        reason,
        deadline: deadlineSpec(t.deadline),
        order: PHASE_INDEX[t.phase] * 1000 + 900 + Math.min(n, 99),
      });
    }
  }
  return out;
}

/** Problemas que impedem guardar a regra (lista vazia = válida). */
export function validateRule(r: OfficeRuleRecord): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push('Indique o nome da regra.');
  r.conditions.forEach((c, i) => {
    const q = questionById(c.question);
    const where = `Condição ${i + 1}`;
    if (!q) out.push(`${where}: escolha a pergunta.`);
    else if (!OPS_BY_TYPE[q.type].includes(c.op)) out.push(`${where}: o operador não serve para esta pergunta.`);
    else if (opNeedsValue(c.op) && !c.value.trim()) out.push(`${where}: escolha o valor.`);
    else if (q.type === 'number' && opNeedsValue(c.op) && !Number.isFinite(Number(c.value))) out.push(`${where}: indique um número.`);
  });
  if (!r.tasks.length) out.push('Acrescente pelo menos uma tarefa.');
  r.tasks.forEach((t, i) => {
    if (!t.title.trim()) out.push(`Tarefa ${i + 1}: indique o título.`);
    if (t.deadline && (!Number.isFinite(t.deadline.amount) || t.deadline.amount < 1 || t.deadline.amount > 3650)) out.push(`Tarefa ${i + 1}: o prazo tem de ser um número entre 1 e 3650.`);
  });
  return out;
}

/** «Património conhecido inclui Contas bancárias» */
export function describeCondition(c: OfficeRuleCondition): string {
  const q = questionById(c.question);
  const name = QUESTION_SHORT[c.question] ?? String(c.question);
  if (!opNeedsValue(c.op) || !q) return `${name} ${OP_LABELS[c.op]}`;
  const value = questionOptions(q).find((o) => o.value === c.value)?.label ?? c.value;
  return `${name} ${OP_LABELS[c.op]} ${value}`;
}

/** Resumo das condições numa frase. */
export function describeConditions(r: Pick<OfficeRuleRecord, 'match' | 'conditions'>): string {
  if (!r.conditions.length) return 'Todos os dossiers';
  return r.conditions.map(describeCondition).join(r.match === 'any' ? ' ou ' : ' e ');
}

/** Exemplos para começar (práticas internas; a adaptar pela equipa). */
export const OFFICE_RULE_EXAMPLES: Array<Pick<OfficeRuleRecord, 'name' | 'reason' | 'match' | 'conditions'> & { tasks: Array<Omit<OfficeRuleTask, 'key'>> }> = [
  {
    name: 'Boas-vindas ao cliente',
    reason: 'prática do escritório em todos os dossiers',
    match: 'all',
    conditions: [],
    tasks: [
      {
        phase: 'abertura',
        title: 'Enviar carta de boas-vindas com as condições do serviço',
        description: 'Carta ou email com a equipa responsável, os passos seguintes, os documentos a reunir e as condições de honorários acordadas.',
        critical: false,
        docs: [],
        legal: [],
      },
    ],
  },
  {
    name: 'Conflito entre interessados',
    reason: 'a partilha está sem acordo',
    match: 'all',
    conditions: [{ question: 'partition', op: 'eq', value: 'conflito' }],
    tasks: [
      {
        phase: 'partilha',
        title: 'Rever a estratégia com o sócio responsável',
        description: 'Reunião interna para decidir entre negociação, mediação ou inventário; registar a decisão nas notas do dossier.',
        critical: true,
        docs: [],
        legal: [],
      },
    ],
  },
  {
    name: 'Passivo por confirmar',
    reason: 'o passivo ainda não está confirmado',
    match: 'all',
    conditions: [{ question: 'liabilities', op: 'eq', value: 'a_confirmar' }],
    tasks: [
      {
        phase: 'passivo',
        title: 'Pedir o mapa de responsabilidades de crédito do de cujus',
        description: 'Pedido ao Banco de Portugal, instruído com a habilitação; confirmar créditos, garantias e avales em nome do de cujus.',
        critical: false,
        docs: ['Mapa de responsabilidades de crédito'],
        legal: [],
        deadline: { kind: 'monthsAfter', amount: 2 },
      },
    ],
  },
];
