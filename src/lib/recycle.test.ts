import { beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from './backup';
import { db, newCase, newDocument, newParty, newTask } from './db';
import { attachFile } from './documents';
import { TRASH_LABELS, daysLeft, deleteTrash, emptyTrash, purgeTrash, restoreTrash, trashCase, trashRecord } from './recycle';

async function seed() {
  await wipeAll();
  await db.settings.put({ key: 'userName', value: 'Ana' });
  const c = newCase({ id: 'c-rec', name: 'Sucessão Reciclagem', ref: 'BS-RC-1' });
  await db.cases.add(c);
  await db.tasks.add(newTask(c.id, { id: 't1', title: 'Tarefa própria', phase: 'abertura' }));
  await db.parties.add(newParty(c.id, { id: 'p1', name: 'Maria' }));
  const doc = newDocument(c.id, { id: 'd1', name: 'Certidão', category: 'obito', status: 'recebido', source: 'manual', key: 'certidao' });
  await db.documents.add(doc);
  await attachFile(doc, new Blob(['%PDF-1.4 reciclagem'], { type: 'application/pdf' }), 'certidao.pdf');
  return c;
}

describe('reciclagem', () => {
  beforeEach(seed);

  it('move um registo para a reciclagem e repõe-o, com registo no histórico', async () => {
    const t = (await db.tasks.get('t1'))!;
    const e = await trashRecord('tasks', t, `“${t.title}”`);
    expect(await db.tasks.get('t1')).toBeUndefined();
    expect(e.table).toBe('tasks');
    expect(e.deletedBy).toBe('Ana');
    expect((e.data as { title: string }).title).toBe('Tarefa própria');
    expect(e.files).toEqual([]);
    expect(await db.trash.count()).toBe(1);
    const back = await restoreTrash(e.id);
    expect(back.id).toBe(e.id);
    expect((await db.tasks.get('t1'))!.title).toBe('Tarefa própria');
    expect(await db.trash.count()).toBe(0);
    const log = await db.activity.where('caseId').equals('c-rec').toArray();
    expect(log.some((a) => a.kind === 'tarefa' && /Reposto da reciclagem: tarefa “Tarefa própria”/.test(a.text))).toBe(true);
    await expect(restoreTrash(e.id)).rejects.toThrow(/já não está na reciclagem/);
    expect(TRASH_LABELS.documents).toBe('Documento');
  });

  it('documentos levam o anexo para a reciclagem e trazem-no de volta', async () => {
    const d = (await db.documents.get('d1'))!;
    expect(await db.files.count()).toBe(1);
    const e = await trashRecord('documents', d, d.name);
    expect(await db.documents.get('d1')).toBeUndefined();
    expect(await db.files.count()).toBe(0);
    expect(e.files).toHaveLength(1);
    expect(e.files[0]!.name).toBe('certidao.pdf');
    await restoreTrash(e.id);
    const restored = (await db.documents.get('d1'))!;
    expect(restored.fileName).toBe('certidao.pdf');
    expect(await (await db.files.get(restored.fileId))!.blob.text()).toContain('reciclagem');
  });

  it('um dossier inteiro vai para a reciclagem como pacote e volta completo', async () => {
    const c = (await db.cases.get('c-rec'))!;
    // uma tarefa já na reciclagem antes de eliminar o dossier mantém-se lá
    const earlier = await trashRecord('parties', (await db.parties.get('p1'))!, 'Maria');
    const e = await trashCase(c);
    expect(e.table).toBe('cases');
    expect(e.label).toBe('BS-RC-1 · Sucessão Reciclagem');
    expect(e.files).toHaveLength(1);
    expect(await db.cases.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
    expect(await db.trash.count()).toBe(2);
    // repor um item cujo dossier está na reciclagem falha com indicação
    await expect(restoreTrash(earlier.id)).rejects.toThrow(/Reponha primeiro o dossier/);
    await restoreTrash(e.id);
    expect((await db.cases.get('c-rec'))!.name).toBe('Sucessão Reciclagem');
    expect(await db.tasks.count()).toBe(1);
    expect(await db.documents.count()).toBe(1);
    expect(await db.files.count()).toBe(1);
    expect((await db.activity.where('caseId').equals('c-rec').toArray()).some((a) => /Dossier reposto da reciclagem/.test(a.text))).toBe(true);
    // agora o interessado pode voltar
    await restoreTrash(earlier.id);
    expect((await db.parties.get('p1'))!.name).toBe('Maria');
    expect(await db.trash.count()).toBe(0);
  });

  it('apagar definitivamente, esvaziar por dossier e expirar ao fim de 30 dias', async () => {
    const t = (await db.tasks.get('t1'))!;
    const e1 = await trashRecord('tasks', t, 'tarefa');
    const e2 = await trashRecord('parties', (await db.parties.get('p1'))!, 'Maria');
    await db.cases.add(newCase({ id: 'c-outro', name: 'Outro', ref: 'BS-RC-2' }));
    await db.notes.add({ id: 'n1', caseId: 'c-outro', text: 'nota', pinned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    const e3 = await trashRecord('notes', (await db.notes.get('n1'))!, 'nota');
    expect(await db.trash.count()).toBe(3);
    await deleteTrash(e1.id);
    expect(await db.trash.count()).toBe(2);
    expect(await emptyTrash('c-rec')).toBe(1);
    expect(await db.trash.get(e2.id)).toBeUndefined();
    expect(await db.trash.get(e3.id)).toBeTruthy();
    // expiração: um item antigo desaparece, um recente fica
    await db.trash.update(e3.id, { deletedAt: '2026-08-01T00:00:00.000Z' });
    expect(daysLeft({ deletedAt: '2026-08-01T00:00:00.000Z' }, new Date('2026-08-20T00:00:00.000Z'))).toBe(11);
    expect(daysLeft({ deletedAt: '2026-08-01T00:00:00.000Z' }, new Date('2026-09-17T00:00:00.000Z'))).toBe(0);
    const t2 = (await db.tasks.toArray())[0];
    if (t2) await trashRecord('tasks', t2, 'x');
    expect(await purgeTrash(30, new Date('2026-09-17T00:00:00.000Z'))).toBe(1);
    expect(await db.trash.get(e3.id)).toBeUndefined();
  });
});
