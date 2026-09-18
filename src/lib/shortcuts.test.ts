// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GOTO, SEQUENCE_MS, createKeymap, isTypingTarget, shortcutSections } from './shortcuts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('atalhos de teclado', () => {
  it('paleta com ⌘/Ctrl+K, mesmo a escrever; pesquisa, nova sucessão e ajuda fora dos campos', () => {
    const km = createKeymap();
    expect(km(key('k', { metaKey: true }), true)).toEqual({ type: 'palette' });
    expect(km(key('K', { ctrlKey: true }), false)).toEqual({ type: 'palette' });
    expect(km(key('/'), false)).toEqual({ type: 'search' });
    expect(km(key('n'), false)).toEqual({ type: 'new' });
    expect(km(key('N', { shiftKey: true }), false)).toEqual({ type: 'new' });
    expect(km(key('?', { shiftKey: true }), false)).toEqual({ type: 'help' });
    expect(km(key('/'), true)).toBeNull();
    expect(km(key('n', { ctrlKey: true }), false)).toBeNull();
    expect(km(key('x'), false)).toBeNull();
  });

  it('«G» e depois a letra vai para a página; fora do prazo ou letra desconhecida não faz nada', () => {
    let t = 1000;
    const km = createKeymap(() => t);
    expect(km(key('g'), false)).toBeNull();
    t += 400;
    expect(km(key('a'), false)).toEqual({ type: 'goto', path: '/agenda' });
    // a letra sozinha não navega
    expect(km(key('a'), false)).toBeNull();
    km(key('g'), false);
    t += SEQUENCE_MS + 1;
    expect(km(key('d'), false)).toBeNull();
    km(key('g'), false);
    expect(km(key('z'), false)).toBeNull();
    // escrever num campo cancela a sequência
    km(key('g'), false);
    expect(km(key('d'), true)).toBeNull();
    expect(km(key('d'), false)).toBeNull();
    expect(new Set(GOTO.map((g) => g.key)).size).toBe(GOTO.length);
  });

  it('reconhece campos de texto e janelas', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('a ajuda mostra ⌘ no Mac e Ctrl nos outros', () => {
    const mac = shortcutSections(true);
    const pc = shortcutSections(false);
    expect(mac[0]!.rows[0]!.keys[0]).toEqual(['⌘', 'K']);
    expect(pc[0]!.rows[0]!.keys[0]).toEqual(['Ctrl', 'K']);
    expect(mac.map((s) => s.title)).toEqual(['Em toda a aplicação', 'Ir para (G e depois a letra)', 'Separadores do dossier', 'Quadro de tarefas', 'Menus']);
  });
});
