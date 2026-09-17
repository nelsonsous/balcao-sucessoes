import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, emptyAnswers, newCase, newTask } from '../lib/db';
import { checkNif } from '../lib/nif';
import type { Answers, TaskRecord } from '../lib/types';
import { computeDeadline, dueState } from './deadlines';
import { desiredTasks } from './engine';
import { blockers, caseHealth, nextAction, taskStats } from './insights';
import { pruneHidden, visibleQuestions } from './questions';
import { syncCaseTasks } from './sync';

const A = (p: Partial<Answers>): Answers => ({ ...emptyAnswers(), ...p });
const keys = (a: Answers) => desiredTasks(a).map((t) => t.key);

describe('prazos', () => {
  it('Imposto do Selo: fim do 3.º mês seguinte ao do óbito', () => {
    const spec = { kind: 'endOfMonthAfter', months: 3, label: '' } as const;
    expect(computeDeadline(spec, '2026-01-15')).toBe('2026-04-30');
    expect(computeDeadline(spec, '2026-01-31')).toBe('2026-04-30');
    expect(computeDeadline(spec, '2026-11-02')).toBe('2027-02-28');
    expect(computeDeadline(spec, '2027-11-30')).toBe('2028-02-29'); // ano bissexto
  });

  it('meses após o óbito com ajuste ao fim do mês', () => {
    expect(computeDeadline({ kind: 'monthsAfter', months: 6, label: '' }, '2026-08-31')).toBe('2027-02-28');
    expect(computeDeadline({ kind: 'monthsAfter', months: 12, label: '' }, '2026-03-10')).toBe('2027-03-10');
  });

  it('IRS: 30 de junho do ano seguinte', () => {
    expect(computeDeadline({ kind: 'dayOfNextYear', month: 6, day: 30, label: '' }, '2026-12-31')).toBe('2027-06-30');
  });

  it('sem data do óbito não há prazo', () => {
    expect(computeDeadline({ kind: 'yearsAfter', years: 10, label: '' }, '')).toBe('');
  });

  it('estado do prazo', () => {
    const today = new Date(2026, 8, 17, 12);
    expect(dueState('2026-09-16', 'pendente', today)).toBe('atrasado');
    expect(dueState('2026-09-17', 'em_curso', today)).toBe('hoje');
    expect(dueState('2026-09-20', 'pendente', today)).toBe('urgente');
    expect(dueState('2026-10-10', 'pendente', today)).toBe('proximo');
    expect(dueState('2026-12-10', 'pendente', today)).toBe('futuro');
    expect(dueState('2026-09-01', 'concluido', today)).toBe('cumprido');
  });
});

describe('motor de regras', () => {
  it('gera sempre as tarefas de base, sem duplicados', () => {
    const k = keys(emptyAnswers());
    expect(k).toContain('obito-certidao');
    expect(k).toContain('procuracao');
    expect(k).toContain('imposto-selo');
    expect(new Set(k).size).toBe(k.length);
  });

  it('pergunta → condição → tarefa (testamento)', () => {
    expect(keys(A({ will: 'sim' }))).toContain('testamento-obter');
    expect(keys(A({ will: 'desconhecido' }))).toContain('testamento-pesquisar');
    expect(keys(A({ will: 'nao' }))).not.toContain('testamento-obter');
  });

  it('ascendentes só relevam na falta de descendentes', () => {
    expect(keys(A({ descendants: 'sim', ascendants: 'sim' }))).not.toContain('ascendentes-registo');
    expect(keys(A({ descendants: 'nao', ascendants: 'sim' }))).toContain('ascendentes-registo');
  });

  it('colaterais quando não há cônjuge, descendentes nem ascendentes', () => {
    const k = keys(A({ spouse: 'nao', descendants: 'nao', ascendants: 'nao' }));
    expect(k).toContain('colaterais');
    expect(k).toContain('selo-10');
  });

  it('sem irmãos: outros colaterais ou Estado', () => {
    expect(keys(A({ spouse: 'nao', descendants: 'nao', ascendants: 'nao', siblings: 'nao' }))).toContain('colaterais-estado');
    expect(keys(A({ spouse: 'nao', descendants: 'nao', ascendants: 'nao', siblings: 'sim' }))).not.toContain('colaterais-estado');
  });

  it('frente internacional e França com prazo de 6 ou 12 meses', () => {
    const inFrance = desiredTasks(A({ deathPlace: 'estrangeiro', deathCountry: 'França', nationality: 'portuguesa' }));
    const fr = inFrance.find((t) => t.key === 'franca-notaire')!;
    expect(fr.deadline).toMatchObject({ kind: 'monthsAfter', months: 6 });
    expect(inFrance.map((t) => t.key)).toContain('transcricao-obito');
    expect(inFrance.map((t) => t.key)).toContain('cse');

    const resident = desiredTasks(A({ deathPlace: 'portugal', habitualResidence: 'franca' }));
    expect(resident.find((t) => t.key === 'franca-notaire')!.deadline).toMatchObject({ months: 12 });
    expect(keys(A({ deathPlace: 'portugal', nationality: 'portuguesa', habitualResidence: 'portugal' }))).not.toContain('frente-internacional');
  });

  it('meação só nos regimes de comunhão', () => {
    expect(keys(A({ spouse: 'casado', regime: 'comunhao_adquiridos' }))).toContain('meacao');
    expect(keys(A({ spouse: 'casado', regime: 'separacao' }))).not.toContain('meacao');
  });

  it('menores: representação e autorização do Ministério Público (salvo inventário)', () => {
    expect(keys(A({ incapable: 'sim', partition: 'acordo' }))).toEqual(expect.arrayContaining(['representacao-incapazes', 'autorizacao-mp']));
    expect(keys(A({ incapable: 'sim', partition: 'conflito' }))).not.toContain('autorizacao-mp');
  });

  it('ordena pelas fases', () => {
    const t = desiredTasks(A({ will: 'sim', assets: ['imoveis'] }));
    const idx = t.map((x) => x.order);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(t[0]!.phase).toBe('abertura');
    expect(t[t.length - 1]!.phase).toBe('encerramento');
  });
});

describe('questionário', () => {
  it('esconde perguntas dependentes e limpa respostas ocultas', () => {
    const a = A({ spouse: 'casado', regime: 'comunhao_geral' });
    expect(visibleQuestions(a).map((q) => q.id)).toContain('regime');
    const b = pruneHidden({ ...a, spouse: 'nao' });
    expect(b.regime).toBe('');
    expect(visibleQuestions(b).map((q) => q.id)).not.toContain('regime');
  });
});

describe('NIF', () => {
  it('valida o dígito de controlo', () => {
    expect(checkNif('123456789').valid).toBe(true);
    expect(checkNif('123456780').valid).toBe(false);
    expect(checkNif('12345678').valid).toBe(false);
    const heranca = checkNif('700000003');
    expect(heranca.valid && heranca.kind).toBe('Herança indivisa');
    expect(checkNif('400000000').valid).toBe(false);
  });
});

describe('leitura do dossier', () => {
  const today = new Date(2026, 8, 17, 12);
  const t = (p: Partial<TaskRecord>) => newTask('c1', p);

  it('próxima ação: atrasadas primeiro, depois críticas', () => {
    const tasks = [
      t({ title: 'normal', status: 'pendente', order: 1 }),
      t({ title: 'crítica', status: 'pendente', critical: true, order: 2 }),
      t({ title: 'atrasada', status: 'em_curso', dueDate: '2026-09-01', order: 3 }),
      t({ title: 'feita', status: 'concluido', order: 0 }),
    ];
    expect(nextAction(tasks, today)!.title).toBe('atrasada');
    expect(nextAction(tasks.slice(0, 2), today)!.title).toBe('crítica');
  });

  it('semáforo global e bloqueios', () => {
    const tasks = [
      t({ status: 'concluido' }),
      t({ status: 'aguarda' }),
      t({ status: 'pendente', critical: true }),
      t({ status: 'na' }),
    ];
    const s = taskStats(tasks, today);
    expect(s.pct).toBe(33);
    expect(caseHealth(s).level).toBe('vermelho');
    const b = blockers(tasks, today);
    expect(b.criticalPending).toHaveLength(1);
    expect(b.awaiting).toHaveLength(1);
    expect(caseHealth(taskStats([t({ status: 'aguarda' })], today)).level).toBe('azul');
    expect(caseHealth(taskStats([t({ status: 'concluido' })], today)).level).toBe('verde');
  });
});

describe('reconciliação da checklist (IndexedDB)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('cria, preserva trabalho, remove intocadas e marca para rever', async () => {
    const c = newCase({ name: 'Teste', deceased: { name: '', nif: '', birthDate: '', deathDate: '2026-01-15', deathCity: '', lastAddress: '' } });
    c.answers = A({ will: 'sim', gifts: 'sim' });
    await db.cases.add(c);
    const r1 = await syncCaseTasks(c);
    expect(r1.added.length).toBeGreaterThan(10);

    const all = await db.tasks.where('caseId').equals(c.id).toArray();
    const selo = all.find((x) => x.ruleKey === 'imposto-selo')!;
    expect(selo.dueDate).toBe('2026-04-30');
    const will = all.find((x) => x.ruleKey === 'testamento-obter')!;
    await db.tasks.update(will.id, { status: 'em_curso' });

    // Deixa de haver testamento e doações
    c.answers = A({ will: 'nao', gifts: 'nao' });
    const r2 = await syncCaseTasks(c);
    expect(r2.obsoleted).toContain(will.title);
    expect(r2.removed.length).toBeGreaterThan(0);
    const after = await db.tasks.where('caseId').equals(c.id).toArray();
    expect(after.find((x) => x.ruleKey === 'testamento-obter')!.obsolete).toBe(true);
    expect(after.find((x) => x.ruleKey === 'doacoes-apurar')).toBeUndefined();

    // Volta a haver testamento: reativa sem perder o estado
    c.answers = A({ will: 'sim' });
    const r3 = await syncCaseTasks(c);
    expect(r3.reactivated).toContain(will.title);
    const back = await db.tasks.get(will.id);
    expect(back!.status).toBe('em_curso');
    expect(back!.obsolete).toBe(false);

    // Nova data do óbito recalcula prazos automáticos, mas não os manuais
    const irs = after.find((x) => x.ruleKey === 'irs-falecido')!;
    await db.tasks.update(irs.id, { dueDate: '2027-05-01', dueSource: 'manual' });
    c.deceased = { ...c.deceased, deathDate: '2026-03-02' };
    await syncCaseTasks(c);
    expect((await db.tasks.get(selo.id))!.dueDate).toBe('2026-06-30');
    expect((await db.tasks.get(irs.id))!.dueDate).toBe('2027-05-01');
  });
});
