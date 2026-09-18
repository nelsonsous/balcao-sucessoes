// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import type { TaskRecord } from '../../lib/types';
import { renderApp, resetDb } from '../../test/render';
import { ChecklistTab } from './ChecklistTab';

const c = newCase({ name: 'Sucessão Teste', ref: 'BS-T-1' });
const tasks: TaskRecord[] = [
  newTask(c.id, { title: 'Obter certidão de óbito', phase: 'abertura', status: 'pendente', order: 1, ruleKey: 'k1', critical: true }),
  newTask(c.id, { title: 'Preparar procuração', phase: 'abertura', status: 'em_curso', order: 2, ruleKey: 'k2' }),
  newTask(c.id, { title: 'Tarefa própria da equipa', phase: 'fiscal', status: 'pendente', order: 10_001 }),
  newTask(c.id, { title: 'Já feita', phase: 'abertura', status: 'concluido', order: 3, ruleKey: 'k3' }),
];

describe('Checklist do dossier', () => {
  beforeEach(async () => {
    await resetDb();
    await db.cases.add(c);
    await db.tasks.bulkAdd(tasks);
  });
  afterEach(resetDb);

  it('lista as tarefas em aberto por fase e abre a gaveta ao clicar', async () => {
    const onOpen = vi.fn();
    renderApp(<ChecklistTab c={c} tasks={tasks} filter="abertas" onFilter={() => undefined} onOpen={onOpen} />);
    expect(await screen.findByText('Obter certidão de óbito')).toBeInTheDocument();
    expect(screen.queryByText('Já feita')).not.toBeInTheDocument();
    expect(screen.getByText('Abertura')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tarefa própria da equipa'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tarefa própria da equipa' }));
  });

  it('muda o estado a partir do semáforo da linha e regista no histórico', async () => {
    renderApp(<ChecklistTab c={c} tasks={tasks} filter="abertas" onFilter={() => undefined} onOpen={() => undefined} />);
    await screen.findByText('Obter certidão de óbito');
    const pills = screen.getAllByRole('button', { name: /Estado: Pendente/ });
    fireEvent.click(pills[0]!);
    fireEvent.click(await screen.findByText('Concluída'));
    await waitFor(async () => expect((await db.tasks.get(tasks[0]!.id))!.status).toBe('concluido'));
    await waitFor(async () => {
      const act = await db.activity.where('caseId').equals(c.id).toArray();
      expect(act.some((a) => a.text.includes('Pendente → Concluída'))).toBe(true);
    });
  });

  it('ações em massa: seleciona todas as visíveis e atribui estado', async () => {
    renderApp(<ChecklistTab c={c} tasks={tasks} filter="abertas" onFilter={() => undefined} onOpen={() => undefined} />);
    await screen.findByText('Obter certidão de óbito');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getByLabelText('Selecionar todas as visíveis'));
    const select = screen.getByLabelText('Mudar estado') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'aguarda' } });
    await waitFor(async () => {
      const open = await db.tasks.where('caseId').equals(c.id).toArray();
      expect(open.filter((t) => t.status === 'aguarda').length).toBe(3);
    });
    expect(await screen.findByText(/3 tarefa\(s\): estado → A aguardar terceiros/)).toBeInTheDocument();
  });

  it('a vista em quadro mostra uma coluna por estado com contagens', async () => {
    renderApp(<ChecklistTab c={c} tasks={tasks} filter="abertas" onFilter={() => undefined} onOpen={() => undefined} />);
    await screen.findByText('Obter certidão de óbito');
    fireEvent.click(screen.getByRole('button', { name: 'Quadro' }));
    const board = await screen.findByRole('list', { name: 'Quadro de tarefas por estado' });
    expect(board).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /Pendente: 2 tarefa/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /Concluída: 1 tarefa/ })).toBeInTheDocument();
  });

  it('ao imprimir, as fases recolhidas abrem-se e o papel diz o filtro; o botão Imprimir chama a impressão', async () => {
    localStorage.removeItem('bs-checklist-view'); // vista «Lista» (outro teste deixa o «Quadro» guardado)
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderApp(<ChecklistTab c={c} tasks={tasks} filter="abertas" onFilter={() => undefined} onOpen={() => undefined} />);
    await screen.findByText('Obter certidão de óbito');
    fireEvent.click(screen.getAllByRole('button', { expanded: true }).find((b) => b.classList.contains('phase-head') && b.textContent?.startsWith('Abertura'))!);
    await waitFor(() => expect(screen.queryByText('Obter certidão de óbito')).not.toBeInTheDocument());
    fireEvent(window, new Event('beforeprint'));
    expect(screen.getByText('Obter certidão de óbito')).toBeInTheDocument();
    expect(screen.getByText(/Checklist — Em aberto · 3 tarefas/)).toBeInTheDocument();
    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(screen.queryByText('Obter certidão de óbito')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});
