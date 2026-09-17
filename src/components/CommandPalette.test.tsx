// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, newCase, newDocument } from '../lib/db';
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

  it('pesquisa global: encontra notas, contactos e documentos e abre o separador certo', async () => {
    const c = (await db.cases.toArray())[0]!;
    await db.notes.add({ id: 'n1', caseId: c.id, text: 'Falar com o notário Xavier sobre a escritura\nsegunda linha', pinned: false, createdAt: '', updatedAt: '' });
    await db.contacts.add({ id: 'k1', caseId: c.id, date: '2026-09-01', person: 'Banco Zeta', role: 'outro', channel: 'email', summary: 'Pedido de saldos à data do óbito', followUp: '', followUpDone: false, createdAt: '' });
    await db.documents.add(newDocument(c.id, { name: 'Certidão de óbito', fileName: 'obito-lyon.pdf', category: 'obito', status: 'recebido', source: 'manual', key: 'certidao' }));
    renderApp(<CommandPalette open onClose={() => undefined} />);
    const input = await screen.findByRole('combobox', { name: 'Pesquisar comandos' });
    fireEvent.change(input, { target: { value: 'xavier' } });
    expect(await screen.findByText('Falar com o notário Xavier sobre a escritura')).toBeInTheDocument();
    expect(screen.getByText(/Nota · BS-9/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'saldos' } });
    expect(await screen.findByText('Banco Zeta — Email')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'lyon' } });
    expect(await screen.findByText('Certidão de óbito')).toBeInTheDocument();
    expect(screen.getByText(/Documento · Recebido/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(location.hash).toBe(`#/dossiers/${c.id}/documentos`));
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
