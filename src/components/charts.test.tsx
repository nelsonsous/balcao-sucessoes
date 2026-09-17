// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, HBarChart } from './charts';

describe('gráficos acessíveis', () => {
  it('barras agrupadas: título, descrição com os valores, legenda, rótulos e tabela alternativa', () => {
    render(
      <BarChart
        title="Dossiers por mês"
        description="Abertos e encerrados."
        categories={['jul 2026', 'ago 2026']}
        series={[
          { name: 'Abertos', values: [2, 0], color: 'var(--primary)' },
          { name: 'Encerrados', values: [1, 3], color: 'var(--st-concluido)' },
        ]}
      />,
    );
    const svg = screen.getByRole('img', { name: /Dossiers por mês/ });
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector('desc')?.textContent).toContain('jul 2026: Abertos 2, Encerrados 1');
    expect(svg.querySelectorAll('rect')).toHaveLength(4);
    expect(screen.getByText('Abertos')).toBeInTheDocument(); // legenda
    expect(screen.getByText('Encerrados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tabela/ }));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Encerrados' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /ago 2026/ })).toHaveTextContent('3');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gráfico/ }));
    expect(screen.getByRole('img', { name: /Dossiers por mês/ })).toBeInTheDocument();
  });

  it('barras empilhadas indicam ausência de dados e não mostram legenda com uma só série', () => {
    render(<BarChart title="Prazos" description="d" categories={['set 2026']} stacked series={[{ name: 'Cumpridos', values: [0], color: 'green' }]} />);
    const svg = screen.getByRole('img', { name: /Prazos/ });
    expect(svg.querySelector('desc')?.textContent).toBe('Sem dados no período.');
    expect(screen.getByText('Sem dados no período')).toBeInTheDocument();
    expect(document.querySelector('.chart-legend')).toBeNull();
  });

  it('barras horizontais mostram valores, notas e «sem dados»', () => {
    render(<HBarChart title="Tempo por fase" description="d" categories={['Abertura', 'Património']} values={[35, null]} unit="dias" notes={['3 dossier(s)', '0 dossier(s)']} />);
    const svg = screen.getByRole('img', { name: /Tempo por fase/ });
    expect(svg.querySelector('desc')?.textContent).toBe('Abertura: 35 dias (3 dossier(s)); Património: sem dados (0 dossier(s))');
    expect(screen.getByText('35 dias')).toBeInTheDocument();
    expect(screen.getByText('sem dados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tabela/ }));
    expect(screen.getByRole('row', { name: /Abertura · 3 dossier/ })).toHaveTextContent('35 dias');
  });
});
