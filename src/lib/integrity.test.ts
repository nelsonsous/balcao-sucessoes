import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newDocument, newEvent, newOfficeRule, newTask, newTimeEntry } from './db';
import { checkIntegrity, loadSnapshot, pickKeeper, repairIntegrity, runIntegrityCheck, type IssueId } from './integrity';
import type { Answers, TaskRecord } from './types';

const DAY = 86_400_000;
const member = (id: string, name: string) => ({ id, name, role: '', color: '#333', createdAt: '2026-01-01T00:00:00.000Z' });
const file = (id: string, size = 1024) => ({ id, blob: new Blob(['x'.repeat(size)]), name: `${id}.pdf`, type: 'application/pdf', size, createdAt: '2026-01-01T00:00:00.000Z' });

async function clean(): Promise<void> {
  for (const t of db.tables) await t.clear();
  await db.members.add(member('m1', 'Ana'));
  await db.cases.add(newCase({ id: 'c1', name: 'Herança Íntegra', ref: 'BS-I-1', responsibleId: 'm1' }));
  await db.tasks.bulkAdd([newTask('c1', { id: 't1', title: 'Obter certidão', ruleKey: 'k1', assigneeId: 'm1' }), newTask('c1', { id: 't2', title: 'Tarefa própria' })]);
  await db.documents.add(newDocument('c1', { id: 'd1', name: 'Certidão de óbito', fileId: 'f1', fileName: 'obito.pdf', fileSize: 1024 }));
  await db.files.add(file('f1'));
  // evento geral da agenda (sem dossier): não é órfão
  await db.events.add(newEvent({ id: 'e0', title: 'Reunião de equipa', caseId: '' }));
}

/** Todas as avarias possíveis, uma de cada. */
async function breakEverything(): Promise<void> {
  await db.tasks.add(newTask('desaparecido', { id: 'orf-t', title: 'Órfã' }));
  await db.notes.add({ id: 'orf-n', caseId: 'desaparecido', text: 'nota órfã', pinned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  await db.documents.add(newDocument('c1', { id: 'd-perdido', name: 'Caderneta predial', fileId: 'f-inexistente', fileName: 'caderneta.pdf', notes: 'pedida ao cliente' }));
  await db.files.add(file('f-solto', 2 * 1_048_576));
  await db.tasks.add(newTask('c1', { id: 't-pessoa', title: 'Atribuída a quem saiu', assigneeId: 'm-removido' }));
  await db.timeEntries.add(newTimeEntry('c1', { id: 'te1', minutes: 30, memberId: 'm-removido' }));
  await db.documents.add(newDocument('c1', { id: 'd-parte', name: 'CC do herdeiro', partyId: 'p-removido' }));
  await db.tasks.bulkAdd([
    newTask('c1', { id: 'dup-a', title: 'Participar o óbito', ruleKey: 'dup', status: 'pendente', notes: 'ligar à AT', createdAt: '2026-02-01T00:00:00.000Z' }),
    newTask('c1', { id: 'dup-b', title: 'Participar o óbito', ruleKey: 'dup', status: 'em_curso', createdAt: '2026-03-01T00:00:00.000Z' }),
  ]);
  const c = (await db.cases.get('c1'))!;
  const answers = { ...c.answers } as Partial<Answers>;
  delete answers.partition;
  await db.cases.update('c1', { answers: answers as Answers });
  await db.settings.bulkPut([
    { key: 'activeTimer', value: { caseId: 'desaparecido', startedAt: '2026-09-18T09:00:00.000Z', description: 'x' } },
    { key: 'meId', value: 'm-removido' },
  ]);
  await db.trash.add({ id: 'tr-velho', caseId: 'c1', table: 'notes', recordId: 'n9', label: 'velha', data: {}, files: [], deletedAt: new Date(Date.now() - 40 * DAY).toISOString(), deletedBy: 'Ana' });
  await db.officeRules.add(newOfficeRule({ id: 'r-mal', name: '', tasks: [] }));
}

describe('integridade dos dados', () => {
  beforeEach(clean);

  it('base em ordem: nenhum problema (e os eventos gerais da agenda não contam como órfãos)', async () => {
    const r = await runIntegrityCheck();
    expect(r.issues).toEqual([]);
    expect(r.totals).toMatchObject({ cases: 1, files: 1 });
  });

  it('encontra cada tipo de problema, com contagens, exemplos e os erros primeiro', async () => {
    await breakEverything();
    const r = await runIntegrityCheck();
    const by = Object.fromEntries(r.issues.map((i) => [i.id, i]));
    expect(Object.keys(by).sort()).toEqual(
      ['anexos-perdidos', 'definicoes-orfas', 'ficheiros-soltos', 'interessados-removidos', 'orfaos', 'pessoas-removidas', 'questionario-incompleto', 'reciclagem-expirada', 'regras-invalidas', 'tarefas-duplicadas'].sort(),
    );
    expect(by.orfaos).toMatchObject({ count: 2, severity: 'aviso' });
    expect(by.orfaos!.detail).toContain('1 tarefa, 1 nota');
    expect(by['anexos-perdidos']).toMatchObject({ count: 1, severity: 'erro' });
    expect(by['anexos-perdidos']!.examples[0]).toBe('Caderneta predial («caderneta.pdf») — BS-I-1 · Herança Íntegra');
    expect(by['ficheiros-soltos']!.detail).toContain('1 ficheiro (2,0 MB)');
    expect(by['pessoas-removidas']).toMatchObject({ count: 2 });
    expect(by['tarefas-duplicadas']).toMatchObject({ count: 1 });
    expect(by['tarefas-duplicadas']!.examples[0]).toContain('Participar o óbito (2×)');
    expect(by['definicoes-orfas']).toMatchObject({ count: 2 });
    expect(by['regras-invalidas']!.repair).toBeUndefined();
    expect(r.issues.map((i) => i.severity)).toEqual([...r.issues.map((i) => i.severity)].sort((a, b) => ['erro', 'aviso', 'info'].indexOf(a) - ['erro', 'aviso', 'info'].indexOf(b)));
  });

  it('repara tudo o que é reparável, sem perder trabalho, e regista no histórico do dossier', async () => {
    await breakEverything();
    const report = await runIntegrityCheck();
    const fixed = await repairIntegrity(report.issues.filter((i) => i.repair).map((i) => i.id));
    expect(fixed).toMatchObject({ orfaos: 2, 'anexos-perdidos': 1, 'ficheiros-soltos': 1, 'pessoas-removidas': 2, 'interessados-removidos': 1, 'tarefas-duplicadas': 1, 'questionario-incompleto': 1, 'definicoes-orfas': 2, 'reciclagem-expirada': 1 });
    const after = await runIntegrityCheck();
    expect(after.issues.map((i) => i.id)).toEqual(['regras-invalidas']);

    // as repetidas juntam-se na que tem mais trabalho (em curso), com as notas da outra
    expect(await db.tasks.get('dup-a')).toBeUndefined();
    expect(await db.tasks.get('dup-b')).toMatchObject({ status: 'em_curso', notes: 'ligar à AT' });
    const doc = (await db.documents.get('d-perdido'))!;
    expect(doc).toMatchObject({ fileId: '', fileName: '', fileSize: 0 });
    expect(doc.notes).toMatch(/^pedida ao cliente\nAnexo «caderneta.pdf» em falta neste dispositivo/);
    expect((await db.cases.get('c1'))!.answers.partition).toBe('');
    expect(await db.tasks.get('t-pessoa')).toMatchObject({ assigneeId: '' });
    expect(await db.timeEntries.get('te1')).toMatchObject({ memberId: '', minutes: 30 });
    expect(await db.files.get('f-solto')).toBeUndefined();
    expect(await db.files.get('f1')).toBeTruthy();
    expect(await db.events.get('e0')).toBeTruthy();
    expect((await db.settings.get('activeTimer'))!.value).toBeNull();
    expect((await db.settings.get('meId'))!.value).toBe('');
    const log = (await db.activity.where('caseId').equals('c1').toArray()).map((a) => a.text);
    expect(log.some((t) => t.startsWith('Verificação de integridade: ') && t.includes('«Participar o óbito» estava repetida (2×)') && t.includes('anexo em falta limpo em «Caderneta predial»'))).toBe(true);
  });

  it('só repara o que se pede', async () => {
    await breakEverything();
    await repairIntegrity(['ficheiros-soltos']);
    const ids = (await runIntegrityCheck()).issues.map((i) => i.id);
    expect(ids).not.toContain('ficheiros-soltos');
    expect(ids).toContain('orfaos');
  });

  it('das repetidas fica a mais trabalhada; em empate, a mais antiga', () => {
    const t = (p: Partial<TaskRecord>) => newTask('c', { ruleKey: 'k', ...p });
    expect(pickKeeper([t({ id: 'a', status: 'pendente' }), t({ id: 'b', status: 'concluido' })]).id).toBe('b');
    expect(pickKeeper([t({ id: 'a', notes: 'x' }), t({ id: 'b' })]).id).toBe('a');
    expect(pickKeeper([t({ id: 'b', createdAt: '2026-02-01' }), t({ id: 'a', createdAt: '2026-01-01' })]).id).toBe('a');
  });

  it('propriedade: com quaisquer avarias, reparar o que é reparável deixa só avisos sem reparação', async () => {
    const kinds = ['orfa', 'anexo', 'solto', 'pessoa', 'parte', 'dup', 'resp'] as const;
    await fc.assert(
      fc.asyncProperty(fc.subarray([...kinds], { minLength: 1 }), async (chosen) => {
        await clean();
        for (const k of chosen) {
          if (k === 'orfa') await db.contacts.add({ id: 'x-c', caseId: 'nada', date: '2026-01-01', person: 'X', role: 'outro', channel: 'email', summary: '', followUp: '', followUpDone: false, createdAt: '2026-01-01T00:00:00.000Z' } as never);
          if (k === 'anexo') await db.documents.add(newDocument('c1', { id: 'x-d', name: 'D', fileId: 'nao-existe' }));
          if (k === 'solto') await db.files.add(file('x-f'));
          if (k === 'pessoa') await db.events.add(newEvent({ id: 'x-e', caseId: 'c1', title: 'E', assigneeId: 'ninguem' }));
          if (k === 'parte') await db.documents.add(newDocument('c1', { id: 'x-p', name: 'P', partyId: 'ninguem' }));
          if (k === 'dup') await db.tasks.bulkAdd([newTask('c1', { id: 'x-t1', ruleKey: 'r', title: 'R' }), newTask('c1', { id: 'x-t2', ruleKey: 'r', title: 'R' }), newTask('c1', { id: 'x-t3', ruleKey: 'r', title: 'R' })]);
          if (k === 'resp') await db.cases.update('c1', { responsibleId: 'ninguem' });
        }
        const r = checkIntegrity(await loadSnapshot());
        expect(r.issues.length).toBeGreaterThan(0);
        await repairIntegrity(r.issues.map((i) => i.id as IssueId));
        expect((await runIntegrityCheck()).issues.filter((i) => i.repair)).toEqual([]);
      }),
      { numRuns: 25 },
    );
  });
});
