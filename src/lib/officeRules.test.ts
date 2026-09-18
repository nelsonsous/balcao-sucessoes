import { beforeEach, describe, expect, it } from 'vitest';
import { syncCaseTasks } from '../engine/sync';
import { createCase, saveAnswers } from './actions';
import { exportBackup } from './backup';
import { db, emptyAnswers, newCase, newOfficeRule, newOfficeRuleTask } from './db';
import { DEMO_RULE_IDS, loadDemoData, removeDemoData } from './demo';
import {
  addExampleRule,
  applyOfficeRules,
  deleteOfficeRule,
  describeDrift,
  duplicateOfficeRule,
  loadOfficeDrift,
  saveOfficeRule,
  setOfficeRuleEnabled,
} from './officeRules';
import type { OfficeRuleRecord } from './types';
import { undoLast } from './undo';

const officeTasks = async (caseId: string) => (await db.tasks.where('caseId').equals(caseId).toArray()).filter((t) => t.ruleKey?.startsWith('office:'));

const contasRule = (p: Partial<OfficeRuleRecord> = {}): OfficeRuleRecord =>
  newOfficeRule({
    id: 'r-contas',
    name: 'Contas bancárias',
    reason: 'há contas bancárias',
    conditions: [{ question: 'assets', op: 'includes', value: 'contas' }],
    tasks: [newOfficeRuleTask({ key: 'k1', title: 'Pedir extratos dos últimos 12 meses', phase: 'patrimonio', docs: ['Extratos'], deadline: { kind: 'daysAfter', amount: 30 } })],
    ...p,
  });

describe('regras do escritório na base de dados', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    await db.cases.bulkAdd([
      newCase({ id: 'c-ativo', name: 'Ativo', ref: 'BS-1', answers: { ...emptyAnswers(), assets: ['contas'] }, deceased: { name: 'A', nif: '', birthDate: '', deathDate: '2026-01-10', deathCity: '', lastAddress: '' } }),
      newCase({ id: 'c-susp', name: 'Suspenso', ref: 'BS-2', stage: 'suspenso', answers: { ...emptyAnswers(), assets: ['contas', 'imoveis'] } }),
      newCase({ id: 'c-fechado', name: 'Concluído', ref: 'BS-3', stage: 'concluido', answers: { ...emptyAnswers(), assets: ['contas'] } }),
      newCase({ id: 'c-outro', name: 'Sem contas', ref: 'BS-4', answers: { ...emptyAnswers(), assets: ['imoveis'] } }),
    ]);
    // checklists da biblioteca já em dia: só as regras do escritório ficam por aplicar
    for (const c of await db.cases.toArray()) await syncCaseTasks(c);
  });

  it('mostra o que falta aplicar e aplica só aos dossiers em curso, com histórico', async () => {
    await saveOfficeRule(contasRule());
    const drift = await loadOfficeDrift();
    expect(drift.caseIds.sort()).toEqual(['c-ativo', 'c-susp']);
    expect(drift.add).toBe(2);
    expect(describeDrift(drift)).toBe('2 tarefas por acrescentar');

    const s = await applyOfficeRules();
    expect(s).toMatchObject({ cases: 3, changedCases: 2 });
    expect(s.added).toEqual(['Pedir extratos dos últimos 12 meses', 'Pedir extratos dos últimos 12 meses']);
    const [t] = await officeTasks('c-ativo');
    expect(t).toMatchObject({ ruleKey: 'office:r-contas:k1', reason: 'há contas bancárias', docs: ['Extratos'], dueDate: '2026-02-09', dueSource: 'regra', status: 'pendente' });
    expect(await officeTasks('c-fechado')).toEqual([]);
    expect(await officeTasks('c-outro')).toEqual([]);
    const log = (await db.activity.where('caseId').equals('c-ativo').toArray()).map((a) => a.text);
    expect(log).toContain('Checklist atualizada pelas regras do escritório: 1 nova(s)');
    expect((await loadOfficeDrift()).caseIds).toEqual([]);
    // aplicar de novo não muda nada
    expect((await applyOfficeRules()).changedCases).toBe(0);
  });

  it('editar a regra atualiza as tarefas sem perder o trabalho feito', async () => {
    await saveOfficeRule(contasRule());
    await applyOfficeRules();
    const [t] = await officeTasks('c-ativo');
    await db.tasks.update(t!.id, { status: 'em_curso', notes: 'Pedido enviado ao banco' });
    await saveOfficeRule(contasRule({ tasks: [newOfficeRuleTask({ key: 'k1', title: 'Pedir extratos (24 meses)', phase: 'patrimonio' })] }));
    const drift = await loadOfficeDrift();
    expect(drift.update).toBe(2);
    const s = await applyOfficeRules();
    expect(s.updated).toBe(2);
    const after = (await officeTasks('c-ativo'))[0]!;
    expect(after).toMatchObject({ id: t!.id, title: 'Pedir extratos (24 meses)', status: 'em_curso', notes: 'Pedido enviado ao banco', dueDate: '', dueLabel: '' });
  });

  it('desativar: tarefas por começar saem, as que têm trabalho ficam «a rever»; reativar recupera-as', async () => {
    await saveOfficeRule(contasRule());
    await applyOfficeRules();
    const [worked] = await officeTasks('c-ativo');
    await db.tasks.update(worked!.id, { status: 'em_curso' });
    await setOfficeRuleEnabled(contasRule(), false);
    const drift = await loadOfficeDrift();
    expect(drift).toMatchObject({ remove: 1, obsolete: 1 });
    expect(describeDrift(drift)).toBe('1 por retirar (ainda por começar) · 1 com trabalho, que ficará «a rever»');
    const s = await applyOfficeRules();
    expect(s.removed).toHaveLength(1);
    expect(s.obsoleted).toHaveLength(1);
    expect(await officeTasks('c-susp')).toEqual([]);
    expect((await officeTasks('c-ativo'))[0]).toMatchObject({ obsolete: true, status: 'em_curso' });
    await setOfficeRuleEnabled(contasRule(), true);
    const back = await applyOfficeRules();
    expect(back.reactivated).toHaveLength(1);
    expect(back.added).toHaveLength(1);
    expect((await officeTasks('c-ativo'))[0]).toMatchObject({ obsolete: false, status: 'em_curso' });
  });

  it('novos dossiers e questionários guardados já incluem as regras ativas', async () => {
    await saveOfficeRule(contasRule());
    const { c, report } = await createCase({ name: 'Novo', answers: { ...emptyAnswers(), assets: ['contas'] } });
    expect(report.added).toContain('Pedir extratos dos últimos 12 meses');
    expect(await officeTasks(c.id)).toHaveLength(1);
    const outro = (await db.cases.get('c-outro'))!;
    const r = await saveAnswers(outro, { ...outro.answers, assets: ['imoveis', 'contas'] });
    expect(r.added).toContain('Pedir extratos dos últimos 12 meses');
    // regras desativadas não entram
    await setOfficeRuleEnabled(contasRule(), false);
    const { c: c2 } = await createCase({ name: 'Outro novo', answers: { ...emptyAnswers(), assets: ['contas'] } });
    expect(await officeTasks(c2.id)).toEqual([]);
  });

  it('duplicar (cópia desativada), remover com «anular», exemplos e cópia de segurança', async () => {
    await saveOfficeRule(contasRule());
    const copy = await duplicateOfficeRule(contasRule());
    expect(copy).toMatchObject({ name: 'Contas bancárias (cópia)', enabled: false });
    expect(copy.id).not.toBe('r-contas');
    expect(copy.tasks[0]!.key).not.toBe('k1');
    expect(copy.tasks[0]!.deadline).toEqual({ kind: 'daysAfter', amount: 30 });

    await deleteOfficeRule(copy);
    expect(await db.officeRules.get(copy.id)).toBeUndefined();
    await undoLast();
    expect(await db.officeRules.get(copy.id)).toMatchObject({ name: 'Contas bancárias (cópia)' });

    const ex = await addExampleRule(1);
    expect(ex).toMatchObject({ name: 'Conflito entre interessados', enabled: true });
    await expect(addExampleRule(99)).rejects.toThrow('Exemplo inexistente.');

    const backup = await exportBackup({ includeFiles: false });
    expect((backup.tables.officeRules ?? []).length).toBe(3);
  });

  it('os dados de demonstração trazem as regras de exemplo e retiram-nas', async () => {
    await loadDemoData();
    expect((await db.officeRules.bulkGet(DEMO_RULE_IDS)).every(Boolean)).toBe(true);
    const tasks = (await db.tasks.toArray()).filter((t) => t.ruleKey === 'office:demo-regra-1:t1');
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    await removeDemoData();
    expect((await db.officeRules.bulkGet(DEMO_RULE_IDS)).some(Boolean)).toBe(false);
  });
});
