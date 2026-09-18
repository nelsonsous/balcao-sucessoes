import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyAnswers, newOfficeRule, newOfficeRuleTask } from '../lib/db';
import type { Answers, OfficeRuleRecord } from '../lib/types';
import { computeDeadline } from './deadlines';
import { desiredTasks } from './engine';
import {
  OFFICE_RULE_EXAMPLES,
  OPS_BY_TYPE,
  conditionHolds,
  deadlineSpec,
  defaultCondition,
  describeCondition,
  describeConditions,
  isOfficeKey,
  officeDesiredTasks,
  officeKey,
  ruleApplies,
  ruleIdFromKey,
  validateRule,
} from './officeRules';
import { PHASE_INDEX } from './phases';
import { QUESTIONS } from './questions';

const A = (p: Partial<Answers> = {}): Answers => ({ ...emptyAnswers(), ...p });

const rule = (p: Partial<OfficeRuleRecord> = {}): OfficeRuleRecord =>
  newOfficeRule({ id: 'r1', name: 'Contas', tasks: [newOfficeRuleTask({ key: 'k1', title: 'Pedir extratos', phase: 'patrimonio' })], ...p });

describe('regras do escritório — condições', () => {
  it('«é» e «não é» em perguntas de escolha única; «não é» só conta se respondida', () => {
    const eq = { question: 'will', op: 'eq', value: 'sim' } as const;
    const neq = { question: 'will', op: 'neq', value: 'sim' } as const;
    expect(conditionHolds(eq, A({ will: 'sim' }))).toBe(true);
    expect(conditionHolds(eq, A({ will: 'nao' }))).toBe(false);
    expect(conditionHolds(neq, A({ will: 'nao' }))).toBe(true);
    expect(conditionHolds(neq, A({ will: 'sim' }))).toBe(false);
    expect(conditionHolds(neq, A())).toBe(false);
  });

  it('«inclui» e «não inclui» em escolhas múltiplas e países', () => {
    const a = A({ assets: ['imoveis', 'contas'], foreignCountries: ['França'] });
    expect(conditionHolds({ question: 'assets', op: 'includes', value: 'contas' }, a)).toBe(true);
    expect(conditionHolds({ question: 'assets', op: 'includes', value: 'veiculos' }, a)).toBe(false);
    expect(conditionHolds({ question: 'assets', op: 'excludes', value: 'veiculos' }, a)).toBe(true);
    expect(conditionHolds({ question: 'assets', op: 'excludes', value: 'veiculos' }, A())).toBe(false);
    expect(conditionHolds({ question: 'foreignCountries', op: 'includes', value: 'França' }, a)).toBe(true);
    expect(conditionHolds({ question: 'deathCountry', op: 'eq', value: 'Suíça' }, A({ deathCountry: 'Suíça' }))).toBe(true);
  });

  it('números: pelo menos, no máximo, igual; sem resposta nunca se cumpre', () => {
    const a = A({ descendantsCount: '3' });
    expect(conditionHolds({ question: 'descendantsCount', op: 'gte', value: '3' }, a)).toBe(true);
    expect(conditionHolds({ question: 'descendantsCount', op: 'gte', value: '4' }, a)).toBe(false);
    expect(conditionHolds({ question: 'descendantsCount', op: 'lte', value: '3' }, a)).toBe(true);
    expect(conditionHolds({ question: 'descendantsCount', op: 'eq', value: '3.0' }, a)).toBe(true);
    expect(conditionHolds({ question: 'descendantsCount', op: 'gte', value: '0' }, A())).toBe(false);
    expect(conditionHolds({ question: 'descendantsCount', op: 'eq', value: '0' }, A())).toBe(false);
  });

  it('«está respondida» e «está por responder»', () => {
    expect(conditionHolds({ question: 'insurance', op: 'answered', value: '' }, A({ insurance: 'desconhecido' }))).toBe(true);
    expect(conditionHolds({ question: 'insurance', op: 'unanswered', value: '' }, A())).toBe(true);
    expect(conditionHolds({ question: 'assets', op: 'answered', value: '' }, A())).toBe(false);
    expect(conditionHolds({ question: 'assets', op: 'unanswered', value: '' }, A({ assets: ['outro'] }))).toBe(false);
  });

  it('sem condições aplica-se sempre; «todas» e «qualquer uma»', () => {
    const conds = [
      { question: 'will', op: 'eq', value: 'sim' },
      { question: 'assets', op: 'includes', value: 'contas' },
    ] as OfficeRuleRecord['conditions'];
    expect(ruleApplies({ match: 'all', conditions: [] }, A())).toBe(true);
    expect(ruleApplies({ match: 'any', conditions: [] }, A())).toBe(true);
    expect(ruleApplies({ match: 'all', conditions: conds }, A({ will: 'sim' }))).toBe(false);
    expect(ruleApplies({ match: 'any', conditions: conds }, A({ will: 'sim' }))).toBe(true);
    expect(ruleApplies({ match: 'all', conditions: conds }, A({ will: 'sim', assets: ['contas'] }))).toBe(true);
  });

  it('a condição por omissão de cada pergunta é válida', () => {
    for (const q of QUESTIONS) {
      const c = defaultCondition(q.id);
      expect(OPS_BY_TYPE[q.type]).toContain(c.op);
      expect(validateRule(rule({ conditions: [c] }))).toEqual([]);
    }
  });
});

describe('regras do escritório — tarefas', () => {
  it('gera tarefas com chave própria, motivo, prazo e ordem no fim da fase', () => {
    const r = rule({
      reason: 'há contas bancárias',
      conditions: [{ question: 'assets', op: 'includes', value: 'contas' }],
      tasks: [
        newOfficeRuleTask({ key: 'k1', title: '  Pedir extratos  ', phase: 'patrimonio', docs: ['Extratos', ' ', ''], legal: [''], deadline: { kind: 'daysAfter', amount: 30 } }),
        newOfficeRuleTask({ key: 'k2', title: '', phase: 'patrimonio' }),
      ],
    });
    expect(officeDesiredTasks([r], A())).toEqual([]);
    const [t, ...rest] = officeDesiredTasks([r], A({ assets: ['contas'] }));
    expect(rest).toEqual([]);
    expect(t).toMatchObject({ key: 'office:r1:k1', ruleId: 'office:r1', title: 'Pedir extratos', reason: 'há contas bancárias', docs: ['Extratos'], legal: [], initialStatus: 'pendente' });
    expect(t!.deadline).toEqual({ kind: 'daysAfter', days: 30, label: '30 dias após o óbito (regra do escritório)' });
    expect(t!.order).toBe(PHASE_INDEX.patrimonio * 1000 + 900);
    // No motor: depois de todas as tarefas da biblioteca da mesma fase.
    const all = desiredTasks(A({ assets: ['contas'] }), [r]);
    const phase = all.filter((x) => x.phase === 'patrimonio');
    expect(phase[phase.length - 1]!.key).toBe('office:r1:k1');
    expect(all.filter((x) => isOfficeKey(x.key))).toHaveLength(1);
  });

  it('regras desativadas não geram nada; sem motivo usa o nome da regra', () => {
    expect(officeDesiredTasks([rule({ enabled: false })], A())).toEqual([]);
    expect(officeDesiredTasks([rule()], A())[0]!.reason).toBe('regra do escritório «Contas»');
  });

  it('ordena por criação e numera dentro da fase', () => {
    const r1 = rule({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' });
    const r2 = rule({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const out = officeDesiredTasks([r1, r2], A());
    expect(out.map((t) => t.key)).toEqual(['office:a:k1', 'office:b:k1']);
    expect(out.map((t) => t.order % 1000)).toEqual([900, 901]);
  });

  it('prazos: dias, meses e fim do mês, calculados a partir do óbito', () => {
    expect(deadlineSpec(undefined)).toBeUndefined();
    expect(deadlineSpec({ kind: 'daysAfter', amount: 0 })).toBeUndefined();
    const days = deadlineSpec({ kind: 'daysAfter', amount: 30 })!;
    const months = deadlineSpec({ kind: 'monthsAfter', amount: 1 })!;
    const eom = deadlineSpec({ kind: 'endOfMonthAfter', amount: 3 })!;
    expect(computeDeadline(days, '2026-01-10')).toBe('2026-02-09');
    expect(months.label).toBe('1 mês após o óbito (regra do escritório)');
    expect(computeDeadline(months, '2026-01-10')).toBe('2026-02-10');
    expect(eom.label).toBe('Até ao fim do 3.º mês seguinte ao do óbito (regra do escritório)');
    expect(computeDeadline(eom, '2026-01-10')).toBe('2026-04-30');
  });

  it('chaves: reconhece e extrai o id da regra', () => {
    expect(officeKey('r9', 'k3')).toBe('office:r9:k3');
    expect(isOfficeKey('office:r9:k3')).toBe(true);
    expect(isOfficeKey('base-abertura-1')).toBe(false);
    expect(isOfficeKey(undefined)).toBe(false);
    expect(ruleIdFromKey('office:r9:k3')).toBe('r9');
    expect(ruleIdFromKey('base-abertura-1')).toBe('');
  });

  it('propriedade: as tarefas do escritório são exatamente as das regras ativas que se aplicam', () => {
    const tri = fc.constantFrom('', 'sim', 'nao', 'desconhecido');
    fc.assert(
      fc.property(
        fc.record({ will: tri, gifts: tri, heirsAbroad: tri }),
        fc.subarray(['imoveis', 'contas', 'veiculos', 'aforro'] as const),
        fc.array(fc.record({ enabled: fc.boolean(), match: fc.constantFrom('all', 'any'), q: fc.constantFrom('will', 'gifts', 'heirsAbroad'), op: fc.constantFrom('eq', 'neq') }), { maxLength: 5 }),
        (tris, assets, specs) => {
          const a = A({ ...(tris as Partial<Answers>), assets: [...assets] });
          const rules = specs.map((s, i) =>
            rule({ id: `r${i}`, enabled: s.enabled, match: s.match as 'all' | 'any', conditions: [{ question: s.q as keyof Answers, op: s.op as 'eq', value: 'sim' }], createdAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z` }),
          );
          const got = new Set(desiredTasks(a, rules).filter((t) => isOfficeKey(t.key)).map((t) => t.key));
          const want = new Set(rules.filter((r) => r.enabled && ruleApplies(r, a)).map((r) => officeKey(r.id, 'k1')));
          expect(got).toEqual(want);
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('regras do escritório — validação e resumo', () => {
  it('aponta nome, tarefas, títulos, valores e prazos em falta', () => {
    const bad = newOfficeRule({
      conditions: [
        { question: 'will', op: 'eq', value: '' },
        { question: 'assets', op: 'eq', value: 'contas' },
        { question: 'descendantsCount', op: 'gte', value: 'x' },
      ],
      tasks: [newOfficeRuleTask({ title: '' }), newOfficeRuleTask({ title: 'Ok', deadline: { kind: 'daysAfter', amount: 0 } })],
    });
    expect(validateRule(bad)).toEqual([
      'Indique o nome da regra.',
      'Condição 1: escolha o valor.',
      'Condição 2: o operador não serve para esta pergunta.',
      'Condição 3: indique um número.',
      'Tarefa 1: indique o título.',
      'Tarefa 2: o prazo tem de ser um número entre 1 e 3650.',
    ]);
    expect(validateRule(newOfficeRule({ name: 'Sem tarefas' }))).toEqual(['Acrescente pelo menos uma tarefa.']);
    expect(validateRule(rule())).toEqual([]);
  });

  it('descreve as condições em linguagem corrente', () => {
    expect(describeCondition({ question: 'assets', op: 'includes', value: 'contas' })).toBe('Património conhecido inclui Contas bancárias');
    expect(describeCondition({ question: 'insurance', op: 'unanswered', value: '' })).toBe('Seguros de vida ou PPR está por responder');
    expect(describeCondition({ question: 'descendantsCount', op: 'gte', value: '3' })).toBe('Número de filhos é pelo menos 3');
    expect(
      describeConditions({
        match: 'any',
        conditions: [
          { question: 'will', op: 'eq', value: 'sim' },
          { question: 'gifts', op: 'eq', value: 'sim' },
        ],
      }),
    ).toBe('Testamento é Sim ou Doações em vida é Sim');
    expect(describeConditions({ match: 'all', conditions: [] })).toBe('Todos os dossiers');
  });

  it('os exemplos são regras válidas', () => {
    for (const ex of OFFICE_RULE_EXAMPLES) {
      const r = newOfficeRule({ ...ex, tasks: ex.tasks.map((t) => newOfficeRuleTask(t)) });
      expect(validateRule(r)).toEqual([]);
    }
  });
});
