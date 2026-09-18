// Escala: um escritório grande (400 dossiers, 24 000 tarefas) tem de continuar fluido.
// Os limites são largos (máquinas de CI lentas): o objetivo é apanhar algoritmos que
// crescem com o quadrado dos dados, que a esta escala levariam dezenas de segundos.
import { describe, expect, it } from 'vitest';
import { analyze } from '../lib/analytics';
import { emptyAnswers, newCase, newOfficeRule, newOfficeRuleTask, newTask } from '../lib/db';
import { buildOverview } from '../lib/hooks';
import { checkIntegrity, type IntegritySnapshot } from '../lib/integrity';
import { officeDrift } from '../lib/officeRules';
import { autoMap, buildRows, parseTable } from '../lib/sheetImport';
import type { CaseRecord, MemberRecord, Status, TaskRecord } from '../lib/types';
import { EMPTY_FILTERS, applyFilters } from '../lib/views';
import { CASE_TABLES } from '../lib/db';

const CASES = 400;
const TASKS_PER_CASE = 60;
const STATUSES: Status[] = ['pendente', 'em_curso', 'aguarda', 'concluido', 'na'];
const PHASES = ['abertura', 'interessados', 'patrimonio', 'fiscal', 'partilha'] as const;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

function bigOffice() {
  const members: MemberRecord[] = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `Pessoa ${i}`, role: '', color: '#333', createdAt: '2026-01-01T00:00:00.000Z' }));
  const cases: CaseRecord[] = Array.from({ length: CASES }, (_, i) =>
    newCase({
      id: `c${i}`,
      ref: `BS-2026-${String(i).padStart(3, '0')}`,
      name: `Herança ${i}`,
      responsibleId: `m${i % 6}`,
      stage: i % 10 === 0 ? 'concluido' : 'ativo',
      answers: { ...emptyAnswers(), assets: i % 2 ? ['contas', 'imoveis'] : ['imoveis'], partition: i % 5 ? 'acordo' : 'conflito' },
      createdAt: `${day(i % 200)}T10:00:00.000Z`,
      updatedAt: `${day((i % 200) + 30)}T10:00:00.000Z`,
    }),
  );
  const tasks: TaskRecord[] = [];
  for (const c of cases)
    for (let j = 0; j < TASKS_PER_CASE; j++) {
      const status = STATUSES[(j + Number(c.id.slice(1))) % STATUSES.length]!;
      tasks.push(
        newTask(c.id, {
          id: `${c.id}-t${j}`,
          title: `Tarefa ${j}`,
          phase: PHASES[j % PHASES.length]!,
          status,
          ruleKey: `k${j}`,
          assigneeId: j % 3 ? `m${j % 6}` : '',
          dueDate: j % 4 ? day(j * 3) : '',
          completedAt: status === 'concluido' ? `${day(j * 2)}T12:00:00.000Z` : '',
          createdAt: c.createdAt,
        }),
      );
    }
  return { members, cases, tasks };
}

const timed = <T>(fn: () => T): { value: T; ms: number } => {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
};

describe('escala: 400 dossiers e 24 000 tarefas', () => {
  const { members, cases, tasks } = bigOffice();
  const byCase = new Map<string, TaskRecord[]>();
  for (const t of tasks) byCase.set(t.caseId, [...(byCase.get(t.caseId) ?? []), t]);

  it('painel e lista de dossiers: resumos, filtros e pesquisa', () => {
    const o = timed(() => cases.map((c) => buildOverview(c, byCase.get(c.id) ?? [])));
    expect(o.value).toHaveLength(CASES);
    expect(o.ms).toBeLessThan(2000);
    const f = timed(() => applyFilters(o.value, { ...EMPTY_FILTERS, q: 'herança 12' }));
    expect(f.value.length).toBeGreaterThan(0);
    expect(f.ms).toBeLessThan(500);
  });

  it('análise da equipa', () => {
    const r = timed(() => analyze({ cases, tasks, members, period: 12, now: new Date('2026-09-18T12:00:00Z') }));
    expect(r.value.members).toHaveLength(6);
    expect(r.ms).toBeLessThan(2000);
  });

  it('alterações por aplicar das regras do escritório', () => {
    const rules = [newOfficeRule({ id: 'r1', name: 'Contas', conditions: [{ question: 'assets', op: 'includes', value: 'contas' }], tasks: [newOfficeRuleTask({ key: 'k', title: 'Extratos', phase: 'patrimonio' })] })];
    const r = timed(() => officeDrift(cases, tasks, rules));
    expect(r.value.caseIds.length).toBeGreaterThan(0);
    expect(r.ms).toBeLessThan(6000);
  });

  it('verificação de integridade', () => {
    const tables = Object.fromEntries(CASE_TABLES.map((t) => [t, t === 'tasks' ? tasks : []])) as unknown as IntegritySnapshot['tables'];
    const r = timed(() => checkIntegrity({ cases, members, tables, files: [], trash: [], settings: { meId: '', activeTimer: null }, officeRules: [] }));
    expect(r.value.issues).toEqual([]);
    expect(r.ms).toBeLessThan(2000);
  });

  it('importação de uma folha com 2 000 linhas', () => {
    const text = ['Nome\tNIF\tParentesco', ...Array.from({ length: 2000 }, (_, i) => `Pessoa ${i}\t\tFilho`)].join('\n');
    const r = timed(() => {
      const t = parseTable(text, 'parties');
      return buildRows(t, autoMap(t.header, 'parties'), 'parties', { parties: [], assets: [], debts: [] });
    });
    expect(r.value).toHaveLength(2000);
    expect(r.ms).toBeLessThan(2000);
  });
});
