// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase, newParty } from '../../lib/db';
import { undoLast } from '../../lib/undo';
import { renderApp, resetDb } from '../../test/render';
import { ImportSheet } from './ImportSheet';

const c = newCase({ id: 'c-imp', name: 'Sucessão Importar', ref: 'BS-I-1' });

describe('Importar de uma folha de cálculo', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(c);
    await db.parties.add(newParty('c-imp', { id: 'p-ana', name: 'Ana Costa' }));
  });

  it('interessados: colar do Excel, ver colunas e avisos, ignorar repetidos, importar e anular', async () => {
    let closed = false;
    renderApp(<ImportSheet c={c} entity="parties" allowed={['parties']} onClose={() => (closed = true)} />);
    const sheet = await screen.findByRole('dialog', { name: 'Importar de uma folha de cálculo' });
    fireEvent.change(within(sheet).getByLabelText(/Dados copiados da folha de cálculo/), {
      target: { value: 'Nome\tNIF\tParentesco\tE-mail\nMaria Exemplo\t123456789\tFilha\tmaria@exemplo.pt\nAna Costa\t\tFilha\t\nRui Exemplo\t123456788\tFilho\t' },
    });
    expect(await within(sheet).findByLabelText('Coluna «Nome»')).toHaveValue('name');
    expect(within(sheet).getByLabelText('Coluna «E-mail»')).toHaveValue('email');
    expect(within(sheet).getByTestId('import-summary')).toHaveTextContent('3 linhas · 2 a importar · 1 com avisos · 1 repetida(s)');
    const table = within(sheet).getByRole('region', { name: 'Pré-visualização da importação' });
    expect(within(table).getByRole('row', { name: /Ana Costa/ })).toHaveTextContent('Repetida: já existe no dossier («Ana Costa»)');
    expect(within(table).getByRole('row', { name: /Rui Exemplo/ })).toHaveTextContent('NIF «123456788» inválido');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Importar 2 interessados' }));
    await waitFor(() => expect(closed).toBe(true));
    expect(await screen.findByText('2 interessados importado(s)')).toBeInTheDocument();
    const parties = await db.parties.where('caseId').equals('c-imp').sortBy('name');
    expect(parties.map((p) => p.name)).toEqual(['Ana Costa', 'Maria Exemplo', 'Rui Exemplo']);
    expect(parties[1]).toMatchObject({ nif: '123456789', kinship: 'filho', email: 'maria@exemplo.pt' });
    expect(parties[2]!.notes).toContain('NIF indicado na folha: 123456788');
    const log = (await db.activity.where('caseId').equals('c-imp').toArray()).map((a) => a.text);
    expect(log).toContain('Importado(s) de uma folha de cálculo: 2 interessados');
    // anular a importação remove só o que foi importado
    await undoLast();
    expect((await db.parties.where('caseId').equals('c-imp').toArray()).map((p) => p.name)).toEqual(['Ana Costa']);
  });

  it('dívidas sem cabeçalho: indicar as colunas à mão e importar', async () => {
    renderApp(<ImportSheet c={c} entity="assets" allowed={['assets', 'debts']} onClose={() => {}} />);
    const sheet = await screen.findByRole('dialog', { name: 'Importar de uma folha de cálculo' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dívidas' }));
    fireEvent.change(within(sheet).getByLabelText(/Dados copiados da folha de cálculo/), { target: { value: 'Banco Exemplo;Crédito à habitação;42.300,00\nFinanças;IMI;310,50' } });
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Indique a coluna com «Credor»');
    expect(within(sheet).getByRole('button', { name: /^Importar/ })).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 1»'), { target: { value: 'creditor' } });
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 2»'), { target: { value: 'description' } });
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 3»'), { target: { value: 'amount' } });
    expect(within(sheet).getByTestId('import-summary')).toHaveTextContent('2 linhas · 2 a importar');
    // escolher um campo já usado noutra coluna troca-o de coluna
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 2»'), { target: { value: 'creditor' } });
    expect(within(sheet).getByLabelText('Coluna «Coluna 1»')).toHaveValue('');
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 1»'), { target: { value: 'creditor' } });
    fireEvent.change(within(sheet).getByLabelText('Coluna «Coluna 2»'), { target: { value: 'description' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Importar 2 dívidas' }));
    await waitFor(async () => expect(await db.debts.count()).toBe(2));
    const debts = (await db.debts.toArray()).sort((a, b) => a.creditor.localeCompare(b.creditor));
    expect(debts.map((d) => [d.creditor, d.amount])).toEqual([
      ['Banco Exemplo', 42300],
      ['Finanças', 310.5],
    ]);
  });
});
