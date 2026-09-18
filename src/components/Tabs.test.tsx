// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs, tabPanelProps } from './ui';

function Demo() {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a');
  return (
    <>
      <Tabs
        idPrefix="t"
        label="Secções"
        value={v}
        onChange={setV}
        items={[
          { id: 'a', label: 'Primeiro' },
          { id: 'b', label: 'Segundo' },
          { id: 'c', label: 'Terceiro' },
        ]}
      />
      <div {...tabPanelProps('t', v)}>Conteúdo {v}</div>
    </>
  );
}

describe('Separadores (padrão ARIA)', () => {
  it('uma só paragem de Tab, setas/Home/End mudam de separador e levam o foco; painel ligado', () => {
    render(<Demo />);
    const tabs = screen.getAllByRole('tab');
    expect(screen.getByRole('tablist', { name: 'Secções' })).toBeInTheDocument();
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Segundo' })).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Segundo' }));
    expect(screen.getByRole('tabpanel', { name: 'Segundo' })).toHaveTextContent('Conteúdo b');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Terceiro' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Primeiro' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Terceiro' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tab', { name: 'Primeiro' })).toHaveAttribute('aria-controls', 't-panel');
  });
});
