// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';
import { ShortcutsHelp } from './ShortcutsHelp';

describe('Ajuda dos atalhos de teclado', () => {
  it('mostra as secções com as teclas e fecha', () => {
    const onClose = vi.fn();
    renderApp(<ShortcutsHelp open onClose={onClose} />);
    const dlg = screen.getByRole('dialog', { name: 'Atalhos de teclado' });
    expect(within(dlg).getByRole('heading', { name: 'Ir para (G e depois a letra)' })).toBeInTheDocument();
    const agenda = within(dlg).getByRole('row', { name: /Agenda/ });
    expect(agenda).toHaveTextContent('G depois A');
    expect(within(dlg).getByRole('row', { name: /Passar a tarefa para a coluna ao lado/ })).toHaveTextContent('Shift + ←');
    fireEvent.click(within(dlg).getAllByRole('button', { name: 'Fechar' }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });
});
