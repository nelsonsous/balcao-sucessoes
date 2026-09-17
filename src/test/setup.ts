// Configuração comum dos testes: IndexedDB em memória e matchers do Testing Library (quando há DOM).
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
  // APIs que o jsdom não implementa e que a aplicação usa de forma defensiva.
  const dialogProto = HTMLDialogElement.prototype as unknown as { showModal?: (this: HTMLDialogElement) => void; close?: (this: HTMLDialogElement) => void };
  if (typeof dialogProto.showModal !== 'function') {
    dialogProto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    dialogProto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false });
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
}
