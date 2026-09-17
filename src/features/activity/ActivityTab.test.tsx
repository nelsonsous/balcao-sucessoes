// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newTask } from '../../lib/db';
import { trashRecord } from '../../lib/recycle';
import { renderApp, resetDb } from '../../test/render';
import { ActivityTab, isReversal } from './ActivityTab';

describe('Histórico filtrável', () => {
  beforeEach(async () => {
    await resetDb();
    await db.cases.add(newCase({ id: 'c-h', name: 'Sucessão Histórico', ref: 'BS-H-1' }));
    const rows = [
      ['a1', 'dossier', 'Dossier criado com 12 tarefas', '2026-09-01T10:00:00.000Z'],
      ['a2', 'tarefa', '“Certidão de óbito”: Pendente → Concluída', '2026-09-02T10:00:00.000Z'],
      ['a3', 'tarefa', 'Anulado: “Certidão de óbito” volta a Pendente', '2026-09-02T10:05:00.000Z'],
      ['a4', 'interessado', 'Interessado adicionado: Maria Santos', '2026-09-03T10:00:00.000Z'],
      ['a5', 'documento', 'Reposto da reciclagem: documento Certidão', '2026-09-04T10:00:00.000Z'],
    ] as const;
    for (const [id, kind, text, at] of rows) await db.activity.add({ id, caseId: 'c-h', kind, text, actor: 'Ana', at });
  });

  it('filtra por tipo, por texto e só anulações/reposições, e mostra a contagem', async () => {
    renderApp(<ActivityTab caseId="c-h" />);
    expect(await screen.findByText('5 de 5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de registo'), { target: { value: 'tarefa' } });
    expect(screen.getByText('2 de 5')).toBeInTheDocument();
    expect(screen.queryByText(/Interessado adicionado/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de registo'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Pesquisar no histórico'), { target: { value: 'maria' } });
    expect(screen.getByText('1 de 5')).toBeInTheDocument();
    expect(screen.getByText(/Interessado adicionado: Maria Santos/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pesquisar no histórico'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum registo corresponde ao filtro')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pesquisar no histórico'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Só anulações e reposições'));
    expect(screen.getByText('2 de 5')).toBeInTheDocument();
    expect(screen.getByText(/Anulado:/)).toBeInTheDocument();
    expect(screen.getByText(/Reposto da reciclagem/)).toBeInTheDocument();
    expect(isReversal({ text: 'Tarefa removida (na reciclagem): x' })).toBe(true);
    expect(isReversal({ text: 'Dossier criado' })).toBe(false);
  });

  it('mostra a ligação para a reciclagem do dossier quando há itens', async () => {
    await db.tasks.add(newTask('c-h', { id: 't1', title: 'Própria', phase: 'abertura' }));
    await trashRecord('tasks', (await db.tasks.get('t1'))!, '“Própria”');
    renderApp(<ActivityTab caseId="c-h" />);
    const link = await screen.findByRole('link', { name: /Reciclagem \(1\)/ });
    expect(link.getAttribute('href')).toContain('/reciclagem?dossier=c-h');
  });
});
