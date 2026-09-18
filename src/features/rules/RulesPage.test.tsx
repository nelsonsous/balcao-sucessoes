// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { syncCaseTasks } from '../../engine/sync';
import { db, emptyAnswers, newCase, newOfficeRule, newOfficeRuleTask } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { RulesPage } from './RulesPage';

const officeTasks = async () => (await db.tasks.toArray()).filter((t) => t.ruleKey?.startsWith('office:'));

describe('Regras do escritório (página)', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.bulkAdd([
      newCase({ id: 'c1', name: 'Sucessão Contas', ref: 'BS-R-1', answers: { ...emptyAnswers(), assets: ['contas'] } }),
      newCase({ id: 'c2', name: 'Sucessão Imóveis', ref: 'BS-R-2', answers: { ...emptyAnswers(), assets: ['imoveis'] } }),
    ]);
    for (const c of await db.cases.toArray()) await syncCaseTasks(c);
  });

  it('cria uma regra com condição e prazo, vê os dossiers abrangidos e aplica-a', async () => {
    renderApp(<RulesPage />);
    expect(await screen.findByText('Sem regras do escritório')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nova regra' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova regra do escritório' });
    // guardar sem nada: mostra o que falta
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar regra' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Indique o nome da regra.');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Tarefa 1: indique o título.');

    fireEvent.change(within(sheet).getByLabelText('Nome da regra'), { target: { value: 'Contas bancárias' } });
    fireEvent.change(within(sheet).getByLabelText('Porque existe'), { target: { value: 'há contas bancárias' } });
    expect(within(sheet).getByTestId('rule-preview')).toHaveTextContent('Aplica-se hoje a 2 de 2 dossiers em curso');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Acrescentar condição' }));
    expect(within(sheet).getByLabelText('Pergunta da condição 1')).toHaveValue('assets');
    fireEvent.change(within(sheet).getByLabelText('Valor da condição 1'), { target: { value: 'contas' } });
    expect(within(sheet).getByTestId('rule-preview')).toHaveTextContent('Aplica-se hoje a 1 de 2 dossiers em curso');
    expect(within(sheet).getByTestId('rule-preview')).toHaveTextContent('BS-R-1 · Sucessão Contas');

    fireEvent.change(within(sheet).getByLabelText('Título'), { target: { value: 'Pedir extratos dos últimos 12 meses' } });
    fireEvent.change(within(sheet).getByLabelText('Fase'), { target: { value: 'patrimonio' } });
    fireEvent.change(within(sheet).getByLabelText('Prazo'), { target: { value: 'daysAfter' } });
    expect(within(sheet).getByLabelText('Quantidade do prazo da tarefa 1')).toHaveValue(30);
    fireEvent.change(within(sheet).getByLabelText('Documentos (um por linha)'), { target: { value: 'Extratos\n\nDeclaração de saldos' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar regra' }));

    expect(await screen.findByText('Regra criada')).toBeInTheDocument();
    const [r] = await db.officeRules.toArray();
    expect(r).toMatchObject({ name: 'Contas bancárias', reason: 'há contas bancárias', enabled: true, conditions: [{ question: 'assets', op: 'includes', value: 'contas' }] });
    expect(r!.tasks[0]).toMatchObject({ title: 'Pedir extratos dos últimos 12 meses', phase: 'patrimonio', docs: ['Extratos', 'Declaração de saldos'], deadline: { kind: 'daysAfter', amount: 30 } });

    // na lista: resumo das condições e alterações por aplicar
    const item = await screen.findByTestId('rule-item');
    expect(item).toHaveTextContent('Quando: Património conhecido inclui Contas bancárias');
    expect(item).toHaveTextContent('Aplica-se a 1 de 2');
    const banner = await screen.findByTestId('rules-drift');
    expect(banner).toHaveTextContent('Há alterações por aplicar em 1 dossier em curso');
    expect(banner).toHaveTextContent('1 tarefa por acrescentar');
    fireEvent.click(within(banner).getByRole('button', { name: 'Aplicar aos dossiers' }));
    const confirmDlg = await screen.findByRole('dialog', { name: 'Aplicar as regras aos dossiers em curso?' });
    fireEvent.click(within(confirmDlg).getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('Regras aplicadas a 1 dossier')).toBeInTheDocument();
    await waitFor(async () => expect(await officeTasks()).toHaveLength(1));
    expect((await officeTasks())[0]).toMatchObject({ caseId: 'c1', title: 'Pedir extratos dos últimos 12 meses' });
    await waitFor(() => expect(screen.queryByTestId('rules-drift')).not.toBeInTheDocument());
  });

  it('exemplos, ativar/desativar, duplicar e abrir por ligação', async () => {
    await db.officeRules.add(
      newOfficeRule({ id: 'r-x', name: 'Veículos', conditions: [{ question: 'assets', op: 'includes', value: 'veiculos' }], tasks: [newOfficeRuleTask({ key: 'k', title: 'Pedir certificado de matrícula', phase: 'patrimonio', critical: true })] }),
    );
    location.hash = '#/regras';
    history.replaceState(null, '', '?regra=r-x#/regras');
    renderApp(<RulesPage />);
    const sheet = await screen.findByRole('dialog', { name: 'Editar regra' });
    expect(within(sheet).getByLabelText('Nome da regra')).toHaveValue('Veículos');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar regra' })).not.toBeInTheDocument());
    // o endereço fica limpo (não volta a abrir ao regressar à página)
    expect(location.search).toBe('');

    const item = await screen.findByTestId('rule-item');
    expect(item).toHaveTextContent('Crítica');
    fireEvent.click(within(item).getByRole('switch', { name: 'Regra ativa: Veículos' }));
    await waitFor(async () => expect((await db.officeRules.get('r-x'))!.enabled).toBe(false));
    expect(await within(item).findByText('Desativada')).toBeInTheDocument();

    fireEvent.click(within(item).getByRole('button', { name: 'Ações da regra Veículos' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Duplicar/ }));
    expect(await screen.findByText('Regra duplicada')).toBeInTheDocument();
    await waitFor(async () => expect(await db.officeRules.count()).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Exemplos de regras' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Conflito entre interessados/ }));
    expect(await screen.findByRole('dialog', { name: 'Editar regra' })).toBeInTheDocument();
    expect(await db.officeRules.count()).toBe(3);
  });
});
