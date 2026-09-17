import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { desiredTasks } from '../engine/engine';
import { bulkSetStatus, bulkUpdateTasks, deleteManualTasks } from './actions';
import { BUILTIN_CASE_TEMPLATES, answeredCount, answersFromTemplate, templateFromCase } from './caseTemplates';
import { db, newCase, newTask } from './db';

describe('modelos de dossier', () => {
  it('os modelos-base têm respostas válidas que geram checklists diferentes', () => {
    const counts = BUILTIN_CASE_TEMPLATES.map((t) => desiredTasks(answersFromTemplate(t)).length);
    expect(counts.every((n) => n > 10)).toBe(true);
    const franca = BUILTIN_CASE_TEMPLATES.find((t) => t.id === 'base-franca')!;
    const tasks = desiredTasks(answersFromTemplate(franca));
    expect(tasks.some((t) => t.phase === 'internacional')).toBe(true);
    const irmaos = BUILTIN_CASE_TEMPLATES.find((t) => t.id === 'base-sem-descendentes')!;
    expect(desiredTasks(answersFromTemplate(irmaos)).some((t) => /irm/i.test(t.title) || /colater/i.test(t.title))).toBe(true);
    expect(answeredCount(franca.answers)).toBeGreaterThan(10);
  });

  it('um modelo criado a partir de um dossier leva respostas, etiquetas e tarefas próprias — sem dados pessoais', () => {
    const c = newCase({ name: 'Sucessão X', ref: 'BS-9', tags: ['França'], priority: 'alta' });
    c.deceased.name = 'Pessoa Real';
    c.answers.spouse = 'casado';
    const tasks = [
      newTask(c.id, { title: 'Regra', ruleKey: 'r1', phase: 'abertura', order: 1 }),
      newTask(c.id, { title: 'Própria', phase: 'fiscal', description: 'x', critical: true, order: 10_001 }),
      newTask(c.id, { title: 'Obsoleta própria', phase: 'fiscal', obsolete: true, order: 10_002 }),
    ];
    const t = templateFromCase(c, tasks, 'Modelo França', 'desc');
    expect(t.name).toBe('Modelo França');
    expect(t.tags).toEqual(['França']);
    expect(t.priority).toBe('alta');
    expect(t.answers.spouse).toBe('casado');
    expect(t.tasks).toEqual([{ title: 'Própria', phase: 'fiscal', description: 'x', critical: true }]);
    expect(JSON.stringify(t)).not.toContain('Pessoa Real');
  });
});

describe('ações em massa', () => {
  it('muda estados, atribui responsável e remove só tarefas próprias, com histórico por dossier', async () => {
    const a = newCase({ name: 'A', ref: 'BS-A' });
    const b = newCase({ name: 'B', ref: 'BS-B' });
    await db.cases.bulkAdd([a, b]);
    const tasks = [
      newTask(a.id, { title: 'a1', ruleKey: 'k', status: 'pendente' }),
      newTask(a.id, { title: 'a2', status: 'pendente' }),
      newTask(b.id, { title: 'b1', ruleKey: 'k', status: 'concluido' }),
    ];
    await db.tasks.bulkAdd(tasks);

    expect(await bulkSetStatus(tasks, 'concluido')).toBe(2);
    expect((await db.tasks.get(tasks[0]!.id))!.status).toBe('concluido');
    expect((await db.tasks.get(tasks[0]!.id))!.completedAt).not.toBe('');
    expect(await bulkUpdateTasks(tasks, { assigneeId: 'm1' }, 'responsável → M')).toBe(3);
    expect((await db.tasks.get(tasks[2]!.id))!.assigneeId).toBe('m1');
    expect(await deleteManualTasks(tasks)).toBe(1);
    expect(await db.tasks.count()).toBe(2);

    const actA = await db.activity.where('caseId').equals(a.id).toArray();
    const actB = await db.activity.where('caseId').equals(b.id).toArray();
    expect(actA.length).toBe(3); // estado, responsável, remoção
    expect(actB.length).toBe(1); // só responsável (o estado já era concluído; sem tarefas próprias)
    expect(actA.some((x) => x.text.includes('2 tarefa(s) → Concluída'))).toBe(true);
  });
});
