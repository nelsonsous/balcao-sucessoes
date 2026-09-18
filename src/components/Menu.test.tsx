// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './ui';

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function setup(align: 'left' | 'right' = 'right') {
  const onA = vi.fn();
  const onB = vi.fn();
  render(
    <Menu
      ariaLabel="Estado"
      align={align}
      items={[
        { label: 'Pendente', onSelect: onA },
        { label: 'Em curso', onSelect: onB, separatorBefore: true },
        { label: 'Concluída', onSelect: vi.fn() },
      ]}
      button={(p) => (
        <button type="button" {...p}>
          Em curso
        </button>
      )}
    />,
  );
  return { onA, onB, trigger: screen.getByRole('button', { name: 'Estado' }) };
}

describe('Menu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('abre na camada superior, com posição fixa calculada junto ao botão e dentro do ecrã', () => {
    // O botão está encostado à esquerda (como o semáforo numa linha da checklist); o menu mede 280 × 180.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') {
        const l = parseFloat(this.style.left || '0');
        const t = parseFloat(this.style.top || '0');
        return rectOf(l, t, 280, 180);
      }
      if (this.tagName === 'BUTTON' && this.getAttribute('aria-haspopup')) return rectOf(20, 300, 120, 32);
      return rectOf(0, 0, 0, 0);
    });
    const { trigger } = setup('right');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Estado' });
    // jsdom não tem Popover API: o menu usa o modo de recurso (posição fixa); no Chrome, o E2E confirma a camada superior.
    expect(menu).not.toHaveAttribute('popover');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(menu.style.left).toBe('20px'); // não sai pela esquerda: trocou para alinhamento à esquerda
    expect(menu.style.top).toBe('338px');
    expect(menu.dataset.side).toBe('bottom');
  });

  it('navega com o teclado, fecha com Esc e devolve o foco ao botão', () => {
    const { onB, trigger } = setup();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'End' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]); // circular
    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    // ↑ no botão abre com o foco no último item; Enter/clique escolhe
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Em curso' }));
    expect(onB).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clique fora fecha; separadores e itens têm os papéis certos', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
