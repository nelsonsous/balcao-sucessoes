// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_TITLE, isPrinting, pageTitle, printPage, routeTitle, useDocumentTitle, usePrinting } from './printing';

describe('impressão', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.dispatchEvent(new Event('afterprint'));
  });

  it('usePrinting fica verdadeiro entre «beforeprint» e «afterprint»', () => {
    const { result } = renderHook(() => usePrinting());
    expect(result.current).toBe(false);
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(result.current).toBe(true);
    expect(isPrinting()).toBe(true);
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(result.current).toBe(false);
  });

  it('printPage usa o título pedido (nome do PDF) e repõe o anterior', () => {
    vi.useFakeTimers();
    document.title = 'Antes';
    let during = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      during = document.title;
    });
    printPage('Checklist BS-1 2026-09-18');
    expect(print).toHaveBeenCalledTimes(1);
    expect(during).toBe('Checklist BS-1 2026-09-18');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Antes');
    // sem «afterprint» (Safari), repõe ao fim de pouco tempo
    printPage('Outro');
    expect(document.title).toBe('Outro');
    vi.advanceTimersByTime(1600);
    expect(document.title).toBe('Antes');
    print.mockRestore();
  });

  it('títulos por rota e do dossier', () => {
    expect(pageTitle()).toBe(APP_TITLE);
    expect(pageTitle('Agenda')).toBe(`Agenda — ${APP_TITLE}`);
    expect(routeTitle('/')).toBe('Visão geral');
    expect(routeTitle('/dossiers')).toBe('Dossiers');
    expect(routeTitle('/dossiers/novo')).toBe('Nova sucessão');
    expect(routeTitle('/dossiers/abc/checklist')).toBeUndefined();
    expect(routeTitle('/regras')).toBe('Regras do escritório');
    renderHook(() => useDocumentTitle('BS-1 · Herança Exemplo'));
    expect(document.title).toBe(`BS-1 · Herança Exemplo — ${APP_TITLE}`);
  });
});
