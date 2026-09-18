// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { ChecklistBoard, neighbourStatus } from './ChecklistBoard';

const c = newCase({ id: 'c-board', name: 'Sucessão Quadro', ref: 'BS-Q-1' });

/** O quadro com os dados vivos (como na checklist). */
function LiveBoard() {
  const tasks = useLiveQuery(() => db.tasks.where('caseId').equals('c-board').toArray(), []);
  return tasks ? <ChecklistBoard tasks={tasks} members={new Map()} onOpen={() => undefined} /> : null;
}

const column = (name: RegExp) => screen.getByRole('listitem', { name });

describe('Quadro da checklist: teclado e alternativa a arrastar', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(c);
    await db.tasks.bulkAdd([
      newTask('c-board', { id: 'a', title: 'Primeira pendente', phase: 'abertura', status: 'pendente', order: 1 }),
      newTask('c-board', { id: 'b', title: 'Segunda pendente', phase: 'abertura', status: 'pendente', order: 2 }),
      newTask('c-board', { id: 'c', title: 'Em curso', phase: 'abertura', status: 'em_curso', order: 3 }),
    ]);
  });

  it('coluna ao lado sem dar a volta', () => {
    expect(neighbourStatus('pendente', 1)).toBe('em_curso');
    expect(neighbourStatus('pendente', -1)).toBeNull();
    expect(neighbourStatus('na', 1)).toBeNull();
  });

  it('setas percorrem os cartões; Shift + → muda o estado e o foco segue o cartão', async () => {
    renderApp(<LiveBoard />);
    const first = await screen.findByRole('button', { name: /^Primeira pendente/ });
    expect(first).toHaveAccessibleDescription(/Shift com seta/);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Segunda pendente');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveTextContent('Em curso');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toHaveTextContent('Primeira pendente');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', shiftKey: true });
    await waitFor(async () => expect((await db.tasks.get('a'))!.status).toBe('em_curso'));
    await waitFor(() => expect(within(column(/^Em curso: 2/)).getByRole('button', { name: /^Primeira pendente/ })).toBe(document.activeElement));
  });

  it('botão «Mudar o estado» (sem arrastar, também no telemóvel)', async () => {
    renderApp(<LiveBoard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar o estado de «Segunda pendente»' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Concluída/ }));
    await waitFor(async () => expect((await db.tasks.get('b'))!.status).toBe('concluido'));
    await waitFor(() => expect(within(column(/^Concluída: 1/)).getByRole('button', { name: /^Segunda pendente/ })).toBeInTheDocument());
  });
});
