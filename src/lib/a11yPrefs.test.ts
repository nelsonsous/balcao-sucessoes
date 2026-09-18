// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyA11y, db, getSetting, setSetting } from './db';
import { scrollBehavior } from './utils';

describe('preferências de acessibilidade', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.contrast;
  });

  it('por omissão seguem o sistema', async () => {
    expect(await getSetting('motion')).toBe('sistema');
    expect(await getSetting('contrast')).toBe('sistema');
  });

  it('animações reduzidas e alto contraste no <html>, guardados para o próximo arranque', async () => {
    await setSetting('motion', 'reduzido');
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    expect(scrollBehavior()).toBe('auto');
    await setSetting('contrast', 'alto');
    expect(document.documentElement.dataset.contrast).toBe('more');
    expect(JSON.parse(localStorage.getItem('bs-a11y')!)).toEqual({ motion: 'reduzido', contrast: 'alto' });
    applyA11y({ motion: 'sistema', contrast: 'sistema' });
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
    expect(document.documentElement.dataset.contrast).toBeUndefined();
    expect(scrollBehavior()).toBe('smooth');
  });
});
