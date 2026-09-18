// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTextEntry, keyboardLikelyOpen, watchVirtualKeyboard } from './keyboard';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  document.body.appendChild(d);
  return d.firstElementChild as HTMLElement;
};

describe('teclado virtual', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('reconhece os campos que abrem o teclado de texto', () => {
    expect(isTextEntry(el('<input>'))).toBe(true);
    expect(isTextEntry(el('<input type="email">'))).toBe(true);
    expect(isTextEntry(el('<input type="search">'))).toBe(true);
    expect(isTextEntry(el('<textarea></textarea>'))).toBe(true);
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el('<input type="date">'))).toBe(false); // abre o seletor, não o teclado
    expect(isTextEntry(el('<select><option>a</option></select>'))).toBe(false);
    expect(isTextEntry(el('<button>ok</button>'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });

  it('só considera o teclado aberto com campo de texto focado e área visível encolhida', () => {
    const input = el('<input>');
    expect(keyboardLikelyOpen(844, 500, input)).toBe(true);
    expect(keyboardLikelyOpen(844, 800, input)).toBe(false); // barra do Safari, não teclado
    expect(keyboardLikelyOpen(844, 500, el('<button>x</button>'))).toBe(false);
  });

  it('marca e desmarca o <body> ao focar um campo e ao encolher a área visível', () => {
    const vv = Object.assign(new EventTarget(), { height: 844 });
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const fakeWin = { visualViewport: vv, innerHeight: 844, document, requestAnimationFrame: raf, cancelAnimationFrame: vi.fn() } as unknown as Window & { visualViewport: typeof vv };
    const stop = watchVirtualKeyboard(fakeWin);
    const input = el('<input>');
    input.focus();
    document.dispatchEvent(new FocusEvent('focusin'));
    expect(document.body.classList.contains('keyboard-open')).toBe(false); // ainda sem teclado
    vv.height = 470;
    vv.dispatchEvent(new Event('resize'));
    expect(document.body.classList.contains('keyboard-open')).toBe(true);
    input.blur();
    document.dispatchEvent(new FocusEvent('focusout'));
    expect(document.body.classList.contains('keyboard-open')).toBe(false);
    input.focus();
    vv.dispatchEvent(new Event('resize'));
    expect(document.body.classList.contains('keyboard-open')).toBe(true);
    stop();
    expect(document.body.classList.contains('keyboard-open')).toBe(false);
    expect(watchVirtualKeyboard({ visualViewport: null, document } as unknown as Window)).toBeTypeOf('function');
  });
});
