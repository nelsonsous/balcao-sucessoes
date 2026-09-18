// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, newCase } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { FeesTab } from './FeesTab';

const c = newCase({ id: 'c-fees', name: 'Sucessão Honorários', ref: 'BS-F-1' });
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');
const kpi = (label: RegExp) => norm(within(screen.getByTestId('fees-kpis')).getByText(label).parentElement?.textContent);

describe('Separador «Honorários»', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(c);
  });

  it('regista tempo, despesa e provisão e mostra os totais (taxa 120 €/h, IVA 23%)', async () => {
    const onReport = vi.fn();
    renderApp(<FeesTab c={c} onReport={onReport} />);
    expect(await screen.findByText('Sem tempo registado')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '1:30' } });
    fireEvent.change(screen.getByLabelText('Descrição', { selector: '#te-desc' }), { target: { value: 'Reunião com o cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar tempo' }));
    const table = await screen.findByTestId('time-table');
    expect(within(table).getByText('Reunião com o cliente')).toBeInTheDocument();
    expect(norm(within(table).getByRole('row', { name: /Reunião com o cliente/ }).textContent)).toContain('180,00 €');
    await waitFor(() => expect(kpi(/Tempo registado/)).toContain('1:30'));
    // despesa a debitar e provisão
    fireEvent.change(screen.getByLabelText('Valor (€)', { selector: '#ex-amount' }), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Descrição', { selector: '#ex-desc' }), { target: { value: 'Certidões' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar despesa' }));
    expect(await within(await screen.findByTestId('expenses-list')).findByText('Certidões')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Valor (€)', { selector: '#pv-amount' }), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar provisão' }));
    await screen.findByTestId('provisions-list');
    // 180 + 41,40 (IVA) + 40 − 100 = 161,40
    await waitFor(() => expect(kpi(/A pagar pelo cliente/)).toContain('161,40 €'));
    expect(kpi(/Honorários/)).toContain('180,00 €');
    fireEvent.click(screen.getByRole('button', { name: 'Nota de honorários' }));
    expect(onReport).toHaveBeenCalled();
    // desmarcar «faturável» tira o registo da nota
    fireEvent.click(screen.getByRole('checkbox', { name: /Faturável: Reunião com o cliente/ }));
    await waitFor(() => expect(kpi(/Honorários/)).toContain('0,00 €'));
  });

  it('acordo de valor fixo e cronómetro (iniciar, parar e registar)', async () => {
    renderApp(<FeesTab c={c} onReport={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Valor fixo' }));
    fireEvent.change(screen.getByLabelText('Honorários acordados (sem IVA)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acordo' }));
    await waitFor(async () => expect((await db.cases.get('c-fees'))!.feesJson).toContain('"fixedFee":1000'));
    fireEvent.change(screen.getByLabelText('O que está a fazer'), { target: { value: 'Análise do testamento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar cronómetro' }));
    expect(await screen.findByTestId('timer-running')).toHaveTextContent('Análise do testamento');
    fireEvent.click(screen.getByRole('button', { name: 'Parar e registar' }));
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    const e = (await db.timeEntries.toArray())[0]!;
    expect(e).toMatchObject({ caseId: 'c-fees', minutes: 1, description: 'Análise do testamento' });
    expect(await screen.findByRole('button', { name: 'Iniciar cronómetro' })).toBeInTheDocument();
  });
});
