// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { AnalyticsPage } from './AnalyticsPage';

describe('Análise da equipa', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('sem dossiers mostra o estado vazio', async () => {
    renderApp(<AnalyticsPage />);
    expect(await screen.findByText('Ainda não há dossiers para analisar')).toBeInTheDocument();
  });

  it('mostra indicadores, gráficos com tabela alternativa e a tabela por pessoa, filtrável', async () => {
    await db.members.bulkAdd([
      { id: 'ana', name: 'Ana Silva', role: 'Advogada', color: '#111', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'rui', name: 'Rui Costa', role: 'Solicitador', color: '#222', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    await db.cases.add(newCase({ id: 'c1', name: 'Um', ref: 'R1', responsibleId: 'ana', createdAt: '2026-06-10T10:00:00.000Z' }));
    await db.cases.add(newCase({ id: 'c2', name: 'Dois', ref: 'R2', responsibleId: 'rui', createdAt: '2026-07-10T10:00:00.000Z' }));
    await db.tasks.add(newTask('c1', { id: 't1', phase: 'abertura', title: 'A', status: 'concluido', dueDate: '2099-01-01', createdAt: '2026-06-10T10:00:00.000Z', completedAt: new Date().toISOString() }));
    await db.tasks.add(newTask('c1', { id: 't2', phase: 'patrimonio', title: 'B', status: 'pendente', dueDate: '2020-01-01', createdAt: '2026-06-10T10:00:00.000Z' }));
    await db.tasks.add(newTask('c2', { id: 't3', phase: 'abertura', title: 'C', status: 'pendente', createdAt: '2026-07-10T10:00:00.000Z' }));
    renderApp(<AnalyticsPage />);
    const table = await screen.findByTestId('members-table');
    expect(await within(table).findByRole('row', { name: /Ana Silva/ })).toHaveTextContent('100%');
    expect(within(table).getByRole('row', { name: /Rui Costa/ })).toHaveTextContent('—');
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(4);
    const kpis = screen.getByTestId('kpis');
    expect(within(kpis).getByText('Dossiers ativos').parentElement).toHaveTextContent('2');
    expect(within(kpis).getByText('Tarefas em atraso').parentElement).toHaveTextContent('1');
    // tabela alternativa do primeiro gráfico
    fireEvent.click(screen.getAllByRole('button', { name: /Tabela/ })[0]!);
    expect(screen.getByRole('columnheader', { name: 'Abertos' })).toBeInTheDocument();
    // filtrar por pessoa
    fireEvent.change(screen.getByLabelText('Pessoa'), { target: { value: 'rui' } });
    expect(within(screen.getByTestId('members-table')).queryByText('Ana Silva')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('kpis')).getByText('Dossiers ativos').parentElement).toHaveTextContent('1');
    // período
    fireEvent.click(screen.getByRole('button', { name: '3 meses' }));
    expect(screen.getByRole('button', { name: '3 meses' })).toHaveAttribute('aria-pressed', 'true');
  });
});
