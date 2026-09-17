// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { DossierList } from './DossierList';

describe('Lista de dossiers: filtros avançados, endereço e vistas', () => {
  beforeEach(async () => {
    await resetDb();
    history.replaceState(null, '', '/');
    await db.cases.add(newCase({ id: 'u', name: 'Sucessão Urgente', ref: 'BS-U', priority: 'urgente', stage: 'ativo' }));
    await db.cases.add(newCase({ id: 'n', name: 'Sucessão Normal', ref: 'BS-N', priority: 'normal', stage: 'ativo' }));
    await db.tasks.add(newTask('u', { title: 'T', phase: 'abertura' }));
    await db.tasks.add(newTask('n', { title: 'T', phase: 'abertura' }));
    await db.notes.add({ id: 'n1', caseId: 'n', text: 'Contactar o notário Xavier', pinned: false, createdAt: '', updatedAt: '' });
  });

  it('filtra pela prioridade no painel, mostra o chip, escreve o endereço e limpa', async () => {
    renderApp(<DossierList />);
    expect(await screen.findByText('Sucessão Urgente')).toBeInTheDocument();
    expect(screen.getByText('Sucessão Normal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    fireEvent.change(await screen.findByLabelText('Prioridade'), { target: { value: 'urgente' } });
    await waitFor(() => expect(location.search).toContain('prio=urgente'));
    expect(await screen.findByText('Prioridade: Urgente')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Sucessão Normal')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver resultados' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros ativos' })).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(location.search).toBe(''));
    expect(await screen.findByText('Sucessão Normal')).toBeInTheDocument();
  });

  it('lê os filtros do endereço e a pesquisa profunda encontra notas', async () => {
    history.replaceState(null, '', '/?q=xavier#/dossiers');
    renderApp(<DossierList />);
    expect(await screen.findByText('Nenhum dossier corresponde aos filtros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    fireEvent.click(await screen.findByLabelText(/Pesquisar também em notas/));
    expect(await screen.findByText('Sucessão Normal')).toBeInTheDocument();
    expect(screen.queryByText('Sucessão Urgente')).not.toBeInTheDocument();
    expect(location.search).toContain('deep=1');
  });

  it('guarda uma vista com nome, lista-a e aplica uma vista predefinida', async () => {
    history.replaceState(null, '', '/?prio=urgente#/dossiers');
    renderApp(<DossierList />);
    expect(await screen.findByText('Sucessão Urgente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vistas' }));
    fireEvent.change(await screen.findByLabelText('Guardar a vista atual'), { target: { value: 'Urgentes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar vista' }));
    expect(await screen.findByText('Vista guardada')).toBeInTheDocument();
    const list = await screen.findByTestId('saved-views');
    expect(within(list).getByRole('button', { name: 'Urgentes' })).toBeInTheDocument();
    expect((await db.settings.get('savedViews'))?.value).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Com prazos ultrapassados' }));
    await waitFor(() => expect(location.search).toContain('prazo=ultrapassado'));
    expect(location.search).not.toContain('prio=');
  });
});
