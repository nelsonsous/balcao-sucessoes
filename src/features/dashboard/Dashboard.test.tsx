// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDemoData } from '../../lib/demo';
import { setSetting } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { Dashboard } from './Dashboard';

describe('Painel (Visão geral)', () => {
  beforeEach(async () => {
    await resetDb();
    await setSetting('userName', 'Ana');
    await loadDemoData();
  });
  afterEach(resetDb);

  it('mostra os indicadores, as próximas ações e os dossiers fictícios', async () => {
    renderApp(<Dashboard />);
    expect(await screen.findByText('Dossiers em curso')).toBeInTheDocument();
    expect(await screen.findByText(/Boa (tarde|noite)|Bom dia/)).toHaveTextContent('Ana');
    expect(await screen.findByText('Próximas ações')).toBeInTheDocument();
    expect((await screen.findAllByText(/Sucessão Dupont-Silva/)).length).toBeGreaterThan(0);
    expect(screen.getByText('A precisar de atenção')).toBeInTheDocument();
  });

  it('as ligações das próximas ações apontam para a tarefa do dossier', async () => {
    renderApp(<Dashboard />);
    await screen.findByText('Próximas ações');
    const links = await screen.findAllByRole('link');
    const task = links.find((a) => (a.getAttribute('href') ?? '').includes('?tarefa='));
    expect(task).toBeDefined();
    expect(task!.getAttribute('href')).toMatch(/^#\/dossiers\/[^/]+\?tarefa=/);
  });
});
