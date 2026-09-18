// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from './db';
import { collectDiagnostics, diagnosticsText, featureChecks, mb } from './diagnostics';
import { runIntegrityCheck } from './integrity';

describe('diagnóstico', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    await db.cases.add(newCase({ id: 'c1', name: 'Herança de Maria Secreta', ref: 'BS-D-1' }));
    await db.tasks.bulkAdd([newTask('c1', { title: 'Tarefa confidencial' }), newTask('c1', { title: 'Outra' })]);
  });

  it('recolhe versão, base de dados, contagens e funcionalidades sem falhar no que não existe', async () => {
    const d = await collectDiagnostics();
    expect(d.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(d.dbVersion).toBeGreaterThanOrEqual(7);
    expect(d.counts.find((c) => c.table === 'cases')!.count).toBe(1);
    expect(d.counts.find((c) => c.table === 'tasks')!.count).toBe(2);
    expect(d.sw.state).toBe('não suportado');
    expect(d.caches).toEqual([]);
    expect(d.features.find((f) => f.id === 'idb')!.ok).toBe(true);
    expect(featureChecks().map((f) => f.id)).toEqual(['sw', 'idb', 'persist', 'crypto', 'popover', 'fs', 'share', 'notif', 'badge', 'clipboard']);
  });

  it('o texto para enviar a quem dá apoio tem contagens e a integridade, mas nunca nomes', async () => {
    const d = await collectDiagnostics();
    const txt = diagnosticsText(d, await runIntegrityCheck());
    expect(txt).toContain('Balcão das Sucessões — diagnóstico');
    expect(txt).toContain(`Versão: ${d.version} · base de dados v${d.dbVersion}`);
    expect(txt).toContain('Dossiers 1 · Tarefas 2');
    expect(txt).toMatch(/Integridade \(.+\): sem problemas em \d+ registos/);
    expect(txt).not.toContain('Maria Secreta');
    expect(txt).not.toContain('Tarefa confidencial');
    expect(txt).not.toContain('BS-D-1');
    expect(mb(1_572_864)).toBe('1,5 MB');
    expect(mb(null)).toBe('—');
    expect(mb(3_064_463_360)).toBe('2,9 GB');
  });
});
