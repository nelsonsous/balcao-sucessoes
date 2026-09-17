// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newParty, newTask } from '../../lib/db';
import { trashCase, trashRecord } from '../../lib/recycle';
import { renderApp, resetDb } from '../../test/render';
import { RecyclePage } from './RecyclePage';

describe('Reciclagem', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(newCase({ id: 'c-r', name: 'Sucessão Reciclar', ref: 'BS-R-1' }));
    await db.tasks.add(newTask('c-r', { id: 't1', title: 'Tarefa própria', phase: 'abertura' }));
    await db.parties.add(newParty('c-r', { id: 'p1', name: 'Maria' }));
  });

  it('lista os itens com tipo, dossier e autor, filtra por tipo e repõe', async () => {
    await trashRecord('tasks', (await db.tasks.get('t1'))!, '“Tarefa própria”');
    await trashRecord('parties', (await db.parties.get('p1'))!, 'Maria');
    renderApp(<RecyclePage />);
    expect(await screen.findByText('2 itens')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'BS-R-1 · Sucessão Reciclar' })).toHaveLength(2);
    expect(screen.getAllByText('por Ana')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'parties' } });
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.queryByText('“Tarefa própria”')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: '' } });
    // a lista vem do mais recente para o mais antigo: a tarefa (apagada primeiro) está na segunda linha
    const row = screen.getByRole('row', { name: /Tarefa própria/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Repor' }));
    await waitFor(async () => expect(await db.tasks.get('t1')).toBeTruthy());
    expect(await db.parties.get('p1')).toBeUndefined();
    expect(await screen.findByText('1 item')).toBeInTheDocument();
    expect(await screen.findByText('Reposto da reciclagem')).toBeInTheDocument();
    expect(screen.getByText('Tarefa: “Tarefa própria”')).toBeInTheDocument();
  });

  it('um dossier eliminado aparece como pacote e volta inteiro', async () => {
    await trashCase((await db.cases.get('c-r'))!);
    renderApp(<RecyclePage />);
    expect(await screen.findByText('2 registos · 0 anexo(s)')).toBeInTheDocument();
    expect(screen.getAllByText('BS-R-1 · Sucessão Reciclar').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'Repor' }));
    await waitFor(async () => expect(await db.cases.count()).toBe(1));
    expect(await db.tasks.count()).toBe(1);
    expect(await screen.findByText('Reciclagem vazia')).toBeInTheDocument();
  });
});
