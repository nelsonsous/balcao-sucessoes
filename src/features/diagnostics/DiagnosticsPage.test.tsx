// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { DiagnosticsPage } from './DiagnosticsPage';

describe('Página de diagnóstico', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(newCase({ id: 'c1', name: 'Herança Diagnóstico', ref: 'BS-D-2' }));
  });

  it('base em ordem: mostra «Tudo em ordem», a versão e as contagens', async () => {
    renderApp(<DiagnosticsPage />);
    expect(await screen.findByText('Tudo em ordem.')).toBeInTheDocument();
    expect(await screen.findByText(/Versão \d+\.\d+\.\d+ · base de dados v\d+/)).toBeInTheDocument();
    const counts = await screen.findByRole('table', { name: 'Registos guardados neste dispositivo' });
    expect(within(counts).getByRole('row', { name: /Dossiers/ })).toHaveTextContent('1');
    expect(screen.getByText('IndexedDB')).toBeInTheDocument();
  });

  it('com problemas: lista-os e repara tudo depois de confirmar', async () => {
    await db.tasks.add(newTask('ja-nao-existe', { title: 'Órfã' }));
    await db.files.add({ id: 'f-solto', blob: new Blob(['abc']), name: 'x.pdf', type: 'application/pdf', size: 3, createdAt: '2026-01-01T00:00:00.000Z' });
    renderApp(<DiagnosticsPage />);
    const box = await screen.findByTestId('integrity');
    expect(await within(box).findByText('Registos de dossiers que já não existem')).toBeInTheDocument();
    expect(within(box).getByText('Anexos que nenhum documento usa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reparar tudo (2)' }));
    const dlg = await screen.findByRole('dialog', { name: 'Reparar 2 problemas?' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reparar' }));
    expect(await screen.findByText('Reparado: 2 registos')).toBeInTheDocument();
    expect(await screen.findByText('Tudo em ordem.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.tasks.count()).toBe(0));
    expect(await db.files.count()).toBe(0);
  });
});
