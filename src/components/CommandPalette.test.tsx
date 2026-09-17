// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, newCase } from '../lib/db';
import { renderApp, resetDb } from '../test/render';
import { CommandPalette } from './CommandPalette';

describe('Paleta de comandos', () => {
  beforeEach(async () => {
    await resetDb();
    await db.cases.add(newCase({ name: 'Sucessão Ferreira', ref: 'BS-9', stage: 'ativo' }));
  });
  afterEach(resetDb);

  it('mostra navegação e ações sem pesquisa e navega com Enter', async () => {
    const onClose = vi.fn();
    renderApp(<CommandPalette open onClose={onClose} />);
    const input = await screen.findByRole('combobox', { name: 'Pesquisar comandos' });
    expect(screen.getByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('Nova sucessão')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'agenda' } });
    expect(await screen.findByText('Agenda')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(location.hash).toBe('#/agenda'));
    expect(onClose).toHaveBeenCalled();
  });

  it('encontra dossiers por nome sem acentos e por referência', async () => {
    renderApp(<CommandPalette open onClose={() => undefined} />);
    const input = await screen.findByRole('combobox', { name: 'Pesquisar comandos' });
    fireEvent.change(input, { target: { value: 'ferreira' } });
    expect(await screen.findByText('Sucessão Ferreira')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'bs-9' } });
    expect(await screen.findByText('Sucessão Ferreira')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(await screen.findByText(/Sem resultados/)).toBeInTheDocument();
  });
});
