import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkSetStatus, bulkUpdateTasks, deleteManualTasks, deleteTask, removeCase, setEventDone, setTaskStatus } from './actions';
import { wipeAll } from './backup';
import { db, newCase, newDocument, newEvent, newTask } from './db';
import { attachFile, deleteDocument, setDocumentStatus } from './documents';
import { clearUndo, onUndo, peekUndo, pushUndo, undoCount, undoEntry, undoLast } from './undo';

describe('pilha de anular', () => {
  beforeEach(() => clearUndo());

  it('regista, avisa, anula a última e uma em concreto, e limita o tamanho', async () => {
    const seen: string[] = [];
    const off = onUndo((e) => seen.push(e.title));
    const calls: string[] = [];
    const a = pushUndo('A', async () => void calls.push('A'), 'desc');
    pushUndo('B', async () => void calls.push('B'));
    expect(seen).toEqual(['A', 'B']);
    expect(undoCount()).toBe(2);
    expect(peekUndo()?.title).toBe('B');
    expect(a.description).toBe('desc');
    expect((await undoLast())?.title).toBe('B');
    expect(calls).toEqual(['B']);
    expect((await undoEntry(a.id))?.title).toBe('A');
    expect(await undoEntry(a.id)).toBeNull();
    expect(await undoLast()).toBeNull();
    off();
    pushUndo('C', async () => undefined);
    expect(seen).toEqual(['A', 'B']);
    clearUndo();
    for (let i = 0; i < 40; i++) pushUndo(`x${i}`, async () => undefined);
    expect(undoCount()).toBe(30);
    expect(peekUndo()?.title).toBe('x39');
  });
});

describe('ações reversíveis', () => {
  beforeEach(async () => {
    clearUndo();
    await wipeAll();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(newCase({ id: 'c-undo', name: 'Sucessão Anular', ref: 'BS-U-1' }));
    await db.tasks.add(newTask('c-undo', { id: 't1', title: 'Certidão', phase: 'abertura', status: 'pendente', ruleKey: 'obito-certidao' }));
    await db.tasks.add(newTask('c-undo', { id: 't2', title: 'Própria', phase: 'abertura', status: 'pendente' }));
  });

  it('mudar o estado de uma tarefa pode ser anulado e fica no histórico', async () => {
    const t = (await db.tasks.get('t1'))!;
    await setTaskStatus(t, 'concluido');
    expect((await db.tasks.get('t1'))!.status).toBe('concluido');
    expect((await db.tasks.get('t1'))!.completedAt).not.toBe('');
    expect(peekUndo()?.title).toContain('Concluída');
    await undoLast();
    const back = (await db.tasks.get('t1'))!;
    expect(back.status).toBe('pendente');
    expect(back.completedAt).toBe('');
    const log = await db.activity.where('caseId').equals('c-undo').toArray();
    expect(log.some((a) => /^Anulado: “Certidão” volta a Pendente/.test(a.text))).toBe(true);
    // estado igual: nada a anular
    await setTaskStatus(back, 'pendente');
    expect(undoCount()).toBe(0);
  });

  it('remover uma tarefa própria vai para a reciclagem e «anular» repõe-na', async () => {
    const t = (await db.tasks.get('t2'))!;
    await deleteTask(t);
    expect(await db.tasks.get('t2')).toBeUndefined();
    expect(await db.trash.count()).toBe(1);
    expect(peekUndo()?.title).toBe('Tarefa removida: “Própria”');
    await undoLast();
    expect((await db.tasks.get('t2'))!.title).toBe('Própria');
    expect(await db.trash.count()).toBe(0);
  });

  it('ações em massa: estado e alterações voltam ao valor anterior de cada tarefa', async () => {
    const tasks = await db.tasks.toArray();
    await db.tasks.update('t2', { status: 'aguarda' });
    const fresh = await db.tasks.toArray();
    expect(await bulkSetStatus(fresh, 'concluido')).toBe(2);
    await undoLast();
    expect((await db.tasks.get('t1'))!.status).toBe('pendente');
    expect((await db.tasks.get('t2'))!.status).toBe('aguarda');
    await bulkUpdateTasks(tasks, { assigneeId: 'm9', critical: true }, 'responsável e criticidade');
    expect((await db.tasks.get('t1'))!.assigneeId).toBe('m9');
    await undoLast();
    expect((await db.tasks.get('t1'))!.assigneeId).toBe('');
    expect((await db.tasks.get('t1'))!.critical).toBe(false);
    const removed = await deleteManualTasks(await db.tasks.toArray());
    expect(removed).toBe(1); // só a própria
    expect(await db.tasks.count()).toBe(1);
    await undoLast();
    expect(await db.tasks.count()).toBe(2);
  });

  it('eliminar um dossier pode ser anulado; documentos voltam com o anexo; estado de documento e evento também', async () => {
    const doc = newDocument('c-undo', { id: 'd1', name: 'Certidão', category: 'obito', status: 'em_falta', source: 'manual', key: 'certidao' });
    await db.documents.add(doc);
    await attachFile(doc, new Blob(['pdf'], { type: 'application/pdf' }), 'c.pdf');
    await setDocumentStatus((await db.documents.get('d1'))!, 'validado');
    expect((await db.documents.get('d1'))!.status).toBe('validado');
    await undoLast();
    expect((await db.documents.get('d1'))!.status).toBe('recebido');
    await deleteDocument((await db.documents.get('d1'))!);
    expect(await db.files.count()).toBe(0);
    await undoLast();
    expect(await db.files.count()).toBe(1);
    expect((await db.documents.get('d1'))!.fileName).toBe('c.pdf');

    const ev = newEvent({ id: 'e1', caseId: 'c-undo', title: 'Escritura', kind: 'escritura', date: '2026-10-01' });
    await db.events.add(ev);
    await setEventDone(ev, true);
    expect((await db.events.get('e1'))!.done).toBe(true);
    await undoLast();
    expect((await db.events.get('e1'))!.done).toBe(false);

    const c = (await db.cases.get('c-undo'))!;
    await removeCase(c);
    expect(await db.cases.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
    expect(peekUndo()?.title).toBe('Dossier eliminado: BS-U-1');
    await undoLast();
    expect((await db.cases.get('c-undo'))!.name).toBe('Sucessão Anular');
    expect(await db.tasks.count()).toBe(2);
    expect(await db.documents.count()).toBe(1);
    expect(await db.files.count()).toBe(1);
  });

  it('o aviso recebe título e descrição úteis', async () => {
    const spy = vi.fn();
    const off = onUndo(spy);
    await deleteTask((await db.tasks.get('t2'))!);
    off();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tarefa removida: “Própria”', description: expect.stringContaining('reciclagem') }));
  });
});
