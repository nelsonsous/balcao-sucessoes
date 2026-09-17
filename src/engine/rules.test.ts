import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyAnswers } from '../lib/db';
import type { Answers } from '../lib/types';
import { desiredTasks } from './engine';
import { PHASES } from './phases';
import { QUESTIONS } from './questions';
import { RULES } from './rules';

const keys = (a: Partial<Answers>) => desiredTasks({ ...emptyAnswers(), ...a }).map((t) => t.key);

describe('regras acrescentadas na iteração 12', () => {
  it('separação de pessoas e bens ou divórcio pendente só com cônjuge casado', () => {
    expect(keys({ spouse: 'casado', separated: 'sim' })).toContain('separacao-efeitos');
    expect(keys({ spouse: 'casado', separated: 'nao' })).not.toContain('separacao-efeitos');
    expect(keys({ spouse: 'uniao_facto', separated: 'sim' })).not.toContain('separacao-efeitos');
    const t = desiredTasks({ ...emptyAnswers(), spouse: 'casado', separated: 'sim' }).find((x) => x.key === 'separacao-efeitos')!;
    expect(t.critical).toBe(true);
    expect(t.legal.join(' ')).toContain('2133.º');
  });
  it('herdeiros no estrangeiro geram procurações e representante fiscal', () => {
    const k = keys({ heirsAbroad: 'sim' });
    expect(k).toContain('procuracoes-estrangeiro');
    expect(k).toContain('representante-fiscal');
    expect(keys({ heirsAbroad: 'nao' })).not.toContain('representante-fiscal');
  });
  it('herdeiros de paradeiro desconhecido geram diligências de localização', () => {
    expect(keys({ unknownHeirs: 'sim' })).toContain('localizar-herdeiros');
    expect(keys({ unknownHeirs: 'desconhecido' })).not.toContain('localizar-herdeiros');
  });
  it('contas conjuntas só com cônjuge ou outros contitulares', () => {
    expect(keys({ assets: ['contas'], spouse: 'casado' })).toContain('contas-conjuntas');
    expect(keys({ assets: ['contas'], others: 'sim' })).toContain('contas-conjuntas');
    expect(keys({ assets: ['contas'], spouse: 'nao', others: 'nao' })).not.toContain('contas-conjuntas');
    expect(keys({ assets: ['imoveis'], spouse: 'casado' })).not.toContain('contas-conjuntas');
  });
  it('passivo conhecido aciona os seguros de crédito; dívidas fiscais e IRS da herança indivisa', () => {
    expect(keys({ liabilities: 'sim' })).toContain('seguro-credito');
    expect(keys({ liabilities: 'nao' })).not.toContain('seguro-credito');
    expect(keys({})).toContain('dividas-fiscais');
    expect(keys({ assets: ['imoveis'] })).toContain('heranca-indivisa-irs');
    expect(keys({ assets: ['contas'] })).not.toContain('heranca-indivisa-irs');
  });
  it('dimensão do motor (atualizar ao acrescentar regras)', () => {
    expect(RULES.length).toBe(59);
    expect(RULES.reduce((n, r) => n + r.tasks.length, 0)).toBe(80);
    expect(QUESTIONS.length).toBe(27);
  });
});

const tri = fc.constantFrom<'' | 'sim' | 'nao' | 'desconhecido'>('', 'sim', 'nao', 'desconhecido');
const answers: fc.Arbitrary<Answers> = fc
  .record({
    deathPlace: fc.constantFrom<Answers['deathPlace']>('', 'portugal', 'estrangeiro'),
    deathCountry: fc.constantFrom('', 'França', 'Brasil', 'Espanha'),
    nationality: fc.constantFrom<Answers['nationality']>('', 'portuguesa', 'francesa', 'outra_ue', 'outra'),
    habitualResidence: fc.constantFrom<Answers['habitualResidence']>('', 'portugal', 'franca', 'outro_ue', 'fora_ue', 'desconhecida'),
    spouse: fc.constantFrom<Answers['spouse']>('', 'casado', 'uniao_facto', 'nao', 'desconhecido'),
    regime: fc.constantFrom<Answers['regime']>('', 'comunhao_adquiridos', 'comunhao_geral', 'separacao', 'desconhecido'),
    descendants: tri,
    descendantsCount: fc.constantFrom('', '1', '3'),
    representation: tri,
    ascendants: tri,
    siblings: tri,
    incapable: tri,
    separated: tri,
    heirsAbroad: tri,
    unknownHeirs: tri,
    others: fc.constantFrom<Answers['others']>('', 'sim', 'nao', 'a_confirmar'),
    will: tri,
    gifts: tri,
    insurance: tri,
    habilitation: fc.constantFrom<Answers['habilitation']>('', 'necessaria', 'nao_necessaria', 'a_confirmar'),
    assets: fc.uniqueArray(fc.constantFrom<Answers['assets'][number]>('imoveis', 'contas', 'participacoes', 'veiculos', 'aforro', 'estrangeiro', 'outro', 'desconhecido'), { maxLength: 5 }),
    foreignCountries: fc.uniqueArray(fc.constantFrom('França', 'Espanha', 'Suíça'), { maxLength: 2 }),
    familyHome: tri,
    liabilities: fc.constantFrom<Answers['liabilities']>('', 'sim', 'nao', 'a_confirmar'),
    insolvencyRisk: tri,
    socialSecurity: tri,
    partition: fc.constantFrom<Answers['partition']>('', 'acordo', 'boas_perspetivas', 'negociacao', 'conflito', 'indeterminado'),
  })
  .map((a) => ({ ...emptyAnswers(), ...a }));

describe('invariantes do motor de regras', () => {
  it('para qualquer questionário: sem erros, chaves únicas, fases válidas, conteúdo completo', () => {
    const phases = new Set(PHASES.map((p) => p.id));
    fc.assert(
      fc.property(answers, (a) => {
        const tasks = desiredTasks(a);
        const ks = tasks.map((t) => t.key);
        expect(new Set(ks).size).toBe(ks.length);
        for (const t of tasks) {
          expect(phases.has(t.phase)).toBe(true);
          expect(t.title.length).toBeGreaterThan(8);
          expect(t.description.length).toBeGreaterThan(20);
          expect(Array.isArray(t.legal)).toBe(true);
        }
        // as tarefas de base existem sempre
        expect(ks).toContain('obito-certidao');
        expect(ks).toContain('imposto-selo');
        expect(ks).toContain('dividas-fiscais');
      }),
      { numRuns: 400 },
    );
  });
  it('mais respostas nunca removem as tarefas de base', () => {
    const base = new Set(keys({}));
    fc.assert(
      fc.property(answers, (a) => {
        const ks = new Set(desiredTasks(a).map((t) => t.key));
        for (const k of base) if (!k.startsWith('colaterais') && k !== 'partilha-perspetiva') expect(ks.has(k)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
