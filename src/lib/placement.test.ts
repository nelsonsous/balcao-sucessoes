import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isInside, placePopover, type Rect } from './placement';

const VIEW = { width: 1366, height: 900 };
const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, right: left + width, bottom: top + height });

describe('posicionamento de menus', () => {
  it('caso reportado: botão de estado à esquerda de um cartão — o menu não sai para a esquerda', () => {
    // Semáforo «Em curso» junto à margem esquerda do conteúdo; menu com 280 px alinhado à direita (comportamento antigo).
    const pill = rect(40, 300, 150, 36);
    const p = placePopover(pill, { width: 280, height: 320 }, VIEW, 'right');
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.align).toBe('left'); // trocou de alinhamento para caber
    expect(p.left).toBe(40);
    expect(p.top).toBe(342);
    expect(p.side).toBe('bottom');
  });

  it('alinhamento à esquerda por omissão do semáforo, e troca para a direita junto à borda direita', () => {
    expect(placePopover(rect(500, 100, 120, 32), { width: 260, height: 200 }, VIEW, 'left')).toMatchObject({ left: 500, align: 'left' });
    const nearRight = placePopover(rect(1250, 100, 100, 32), { width: 260, height: 200 }, VIEW, 'left');
    expect(nearRight.align).toBe('right');
    expect(nearRight.left).toBe(1350 - 260);
  });

  it('abre para cima quando não há espaço por baixo, e limita a altura quando não cabe em lado nenhum', () => {
    const low = placePopover(rect(600, 820, 120, 36), { width: 240, height: 300 }, VIEW, 'left');
    expect(low.side).toBe('top');
    expect(low.top).toBe(820 - 6 - 300);
    expect(low.maxHeight).toBeNull();
    const tall = placePopover(rect(600, 400, 120, 36), { width: 240, height: 2000 }, VIEW, 'left');
    expect(tall.maxHeight).not.toBeNull();
    expect(tall.top).toBeGreaterThanOrEqual(8);
    expect(tall.top + (tall.maxHeight ?? 0)).toBeLessThanOrEqual(VIEW.height - 8);
  });

  it('no telemóvel, um menu mais largo do que o ecrã fica com largura limitada e dentro das margens', () => {
    const phone = { width: 390, height: 844 };
    const p = placePopover(rect(300, 200, 60, 36), { width: 420, height: 200 }, phone, 'right');
    expect(p.maxWidth).toBe(374);
    expect(p.left).toBe(8);
  });

  it('propriedade: para qualquer botão visível e qualquer tamanho, o menu fica sempre dentro do ecrã', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        fc.integer({ min: 480, max: 1200 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 24, max: 200 }),
        fc.integer({ min: 120, max: 600 }),
        fc.integer({ min: 40, max: 1500 }),
        fc.constantFrom<'left' | 'right'>('left', 'right'),
        (vw, vh, fx, fy, bw, mw, mh, align) => {
          const bx = Math.round(fx * Math.max(0, vw - bw));
          const by = Math.round(fy * Math.max(0, vh - 36));
          const p = placePopover(rect(bx, by, bw, 36), { width: mw, height: mh }, { width: vw, height: vh }, align);
          const w = p.maxWidth ?? mw;
          const h = p.maxHeight ?? mh;
          expect(isInside({ left: p.left, top: p.top, right: p.left + w, bottom: p.top + h }, { left: 8, top: 8, right: vw - 8, bottom: vh - 8 })).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});
