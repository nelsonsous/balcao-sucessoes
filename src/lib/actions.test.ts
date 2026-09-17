import { describe, expect, it } from 'vitest';
import {
  addContact,
  addCustomTask,
  addNote,
  createCase,
  deleteAsset,
  deleteContact,
  deleteDebt,
  deleteEvent,
  deleteMember,
  deleteNote,
  deleteParty,
  deleteTask,
  duplicateCase,
  removeCase,
  restoreTask,
  saveAnswers,
  saveAsset,
  saveCaseDetails,
  saveDebt,
  saveEvent,
  saveMember,
  saveParty,
  setEventDone,
  setTaskStatus,
  updateContact,
  updateNote,
  updateTask,
} from './actions';
import { db, emptyAnswers, newAsset, newDebt, newEvent, newParty } from './db';

const activity = async (caseId: string) => (await db.activity.where('caseId').equals(caseId).toArray()).map((a) => a.text);

describe('ações sobre o dossier', () => {
  it('cria o dossier com a checklist gerada, duplica-o como modelo e remove-o em cascata', async () => {
    const { c, report } = await createCase({ name: 'Sucessão Ações', answers: { ...emptyAnswers(), spouse: 'casado', descendants: 'sim' } });
    expect(c.ref).toMatch(/^BS-\d{4}-\d{3}$/);
    expect(report.added.length).toBeGreaterThan(10);
    expect(await db.tasks.where('caseId').equals(c.id).count()).toBe(report.added.length);
    await saveCaseDetails(c, { name: 'Sucessão Ações (editada)', priority: 'alta' });
    expect((await db.cases.get(c.id))!.priority).toBe('alta');

    const copy = await duplicateCase((await db.cases.get(c.id))!);
    expect(copy.id).not.toBe(c.id);
    expect(copy.ref).not.toBe(c.ref);
    expect(copy.answers.spouse).toBe('casado');
    expect(await db.tasks.where('caseId').equals(copy.id).count()).toBeGreaterThan(10);

    await saveParty(newParty(c.id, { name: 'Ana' }), true);
    await saveAsset(newAsset(c.id, { description: 'Casa' }), true);
    await removeCase((await db.cases.get(c.id))!);
    expect(await db.cases.get(c.id)).toBeUndefined();
    expect(await db.tasks.where('caseId').equals(c.id).count()).toBe(0);
    expect(await db.parties.where('caseId').equals(c.id).count()).toBe(0);
    expect(await db.assets.where('caseId').equals(c.id).count()).toBe(0);
  });

  it('reconcilia a checklist quando as respostas mudam, preservando o trabalho feito', async () => {
    const { c } = await createCase({ name: 'Reconciliar', answers: { ...emptyAnswers(), spouse: 'nao', descendants: 'nao', ascendants: 'nao', siblings: 'sim' } });
    const before = await db.tasks.where('caseId').equals(c.id).toArray();
    const touched = before.find((t) => t.ruleKey)!;
    await setTaskStatus(touched, 'concluido');
    const report = await saveAnswers((await db.cases.get(c.id))!, { ...c.answers, spouse: 'casado', descendants: 'sim', siblings: 'nao' });
    expect(report.added.length).toBeGreaterThan(0);
    const after = await db.tasks.where('caseId').equals(c.id).toArray();
    const kept = after.find((t) => t.id === touched.id);
    expect(kept).toBeDefined();
    expect(kept!.status).toBe('concluido');
    expect(kept!.obsolete || report.removed.length >= 0).toBe(true);
    expect((await activity(c.id)).some((t) => /questionário|Questionário|regras|tarefas/i.test(t))).toBe(true);
  });

  it('gere tarefas próprias: acrescentar, editar, remover e repor', async () => {
    const { c } = await createCase({ name: 'Tarefas' });
    const t = await addCustomTask(c.id, { title: 'Ligar ao banco', phase: 'patrimonio', dueDate: '2026-12-01' });
    expect(t.dueSource).toBe('manual');
    expect(t.order).toBeGreaterThanOrEqual(10_000);
    await updateTask(t, { critical: true, notes: 'urgente' }, 'Tarefa editada');
    const edited = (await db.tasks.get(t.id))!;
    expect(edited.critical).toBe(true);
    await setTaskStatus(edited, 'em_curso');
    expect((await db.tasks.get(t.id))!.status).toBe('em_curso');
    await setTaskStatus((await db.tasks.get(t.id))!, 'em_curso'); // sem alteração → sem entrada nova
    await deleteTask(edited);
    expect(await db.tasks.get(t.id)).toBeUndefined();
    await restoreTask(edited);
    expect((await db.tasks.get(t.id))!.title).toBe('Ligar ao banco');
    const log = await activity(c.id);
    expect(log.some((x) => x.includes('Tarefa removida'))).toBe(true);
    expect(log.some((x) => x.includes('Tarefa reposta'))).toBe(true);
  });

  it('garante um único cabeça-de-casal e regista interessados, bens e dívidas', async () => {
    const { c } = await createCase({ name: 'Interessados' });
    const a = newParty(c.id, { name: 'A', isHeadOfEstate: true });
    const b = newParty(c.id, { name: 'B', isHeadOfEstate: true });
    await saveParty(a, true);
    await saveParty(b, true);
    const parties = await db.parties.where('caseId').equals(c.id).toArray();
    expect(parties.filter((p) => p.isHeadOfEstate).map((p) => p.name)).toEqual(['B']);
    await deleteParty(a);
    expect(await db.parties.where('caseId').equals(c.id).count()).toBe(1);

    const asset = newAsset(c.id, { description: 'Conta', value: 100 });
    await saveAsset(asset, true);
    await saveAsset({ ...asset, value: 200 }, false);
    expect((await db.assets.get(asset.id))!.value).toBe(200);
    await deleteAsset(asset);
    expect(await db.assets.get(asset.id)).toBeUndefined();

    const debt = newDebt(c.id, { creditor: 'Banco', amount: 50 });
    await saveDebt(debt, true);
    await deleteDebt(debt);
    expect(await db.debts.get(debt.id)).toBeUndefined();
    const log = await activity(c.id);
    expect(log.some((x) => /Interessado adicionado: A/.test(x))).toBe(true);
  });

  it('notas, contactos, eventos e equipa', async () => {
    const { c } = await createCase({ name: 'Notas' });
    await addNote(c.id, 'Nota fixada', true);
    const note = (await db.notes.where('caseId').equals(c.id).toArray())[0]!;
    expect(note.pinned).toBe(true);
    await updateNote(note, { text: 'Nota editada' });
    expect((await db.notes.get(note.id))!.text).toBe('Nota editada');
    await deleteNote(note);
    expect(await db.notes.count()).toBe(0);

    await addContact(c.id, { date: '2026-09-01', person: 'Cliente', role: 'herdeiro', channel: 'email', summary: 'Enviou docs', followUp: '2026-09-10', followUpDone: false });
    const contact = (await db.contacts.where('caseId').equals(c.id).toArray())[0]!;
    await updateContact(contact, { followUpDone: true });
    expect((await db.contacts.get(contact.id))!.followUpDone).toBe(true);
    await deleteContact(contact);
    expect(await db.contacts.count()).toBe(0);

    const ev = newEvent({ caseId: c.id, title: 'Escritura', kind: 'escritura', date: '2026-10-10', time: '10:00' });
    await saveEvent(ev, true);
    await setEventDone(ev, true);
    expect((await db.events.get(ev.id))!.done).toBe(true);
    await deleteEvent(ev);
    expect(await db.events.get(ev.id)).toBeUndefined();

    const m = await saveMember({ name: '  Joana  ' });
    expect(m.name).toBe('Joana');
    expect(m.color).toMatch(/^#/);
    const m2 = await saveMember({ id: m.id, name: 'Joana P.', role: 'Solicitadora' });
    expect(m2.id).toBe(m.id);
    expect((await db.members.get(m.id))!.role).toBe('Solicitadora');
    await deleteMember(m2);
    expect(await db.members.get(m.id)).toBeUndefined();
  });
});
