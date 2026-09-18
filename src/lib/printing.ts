// Impressão dos ecrãs: saber quando se está a imprimir (para abrir o que está recolhido,
// como as fases da checklist) e imprimir com um título de página útil — o Chrome e o
// Safari usam o título como nome do PDF.
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type Listener = (printing: boolean) => void;

const listeners = new Set<Listener>();
let current = false;
let installed = false;

function emit(v: boolean): void {
  if (v === current) return;
  current = v;
  for (const l of listeners) l(v);
}

/** Antes de imprimir, a atualização tem de ser síncrona: o navegador compõe a página logo a seguir. */
const start = () => flushSync(() => emit(true));
const stop = () => emit(false);

function install(win: Window): void {
  if (installed) return;
  installed = true;
  win.addEventListener('beforeprint', start);
  win.addEventListener('afterprint', stop);
  // Também quando a impressão é simulada (pré-visualização, geração de PDF sem diálogo).
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('print') : null;
  mq?.addEventListener?.('change', (e) => (e.matches ? start() : stop()));
}

export const isPrinting = (): boolean => current;

/** true enquanto a página está a ser impressa. */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(current);
  useEffect(() => {
    if (typeof window !== 'undefined') install(window);
    listeners.add(setPrinting);
    setPrinting(current);
    return () => {
      listeners.delete(setPrinting);
    };
  }, []);
  return printing;
}

export const APP_TITLE = 'Balcão das Sucessões';

/** Título do separador do navegador (e nome sugerido do PDF): «Página — Balcão das Sucessões». */
export function pageTitle(label?: string): string {
  return label ? `${label} — ${APP_TITLE}` : APP_TITLE;
}

/** Título do separador por rota (os dossiers definem o seu, com a referência). */
const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Visão geral'],
  [/^\/dossiers\/novo/, 'Nova sucessão'],
  [/^\/dossiers\/?$/, 'Dossiers'],
  [/^\/agenda/, 'Agenda'],
  [/^\/tarefas/, 'O que está a bloquear?'],
  [/^\/minhas/, 'As minhas tarefas'],
  [/^\/calculadora/, 'Calculadora sucessória'],
  [/^\/prazos/, 'Calculadora de prazos'],
  [/^\/minutas/, 'Minutas'],
  [/^\/definicoes/, 'Definições'],
  [/^\/recebidos/, 'Recebidos'],
  [/^\/reciclagem/, 'Reciclagem'],
  [/^\/analise/, 'Análise da equipa'],
  [/^\/regras/, 'Regras do escritório'],
  [/^\/diagnostico/, 'Diagnóstico'],
];

export function routeTitle(path: string): string | undefined {
  return ROUTE_TITLES.find(([re]) => re.test(path))?.[1];
}

export function useDocumentTitle(label: string | undefined): void {
  useEffect(() => {
    if (typeof document === 'undefined' || label === undefined) return;
    document.title = pageTitle(label);
  }, [label]);
}

/**
 * Imprime a página atual. Com `fileLabel`, o título passa a ser esse texto durante a impressão
 * (o PDF fica, por exemplo, «Checklist BS-2026-004 2026-09-18.pdf») e volta ao anterior no fim.
 */
export function printPage(fileLabel?: string, win: Window = window): void {
  const doc = win.document;
  const previous = doc.title;
  if (fileLabel) doc.title = fileLabel;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    doc.title = previous;
    win.removeEventListener('afterprint', restore);
  };
  win.addEventListener('afterprint', restore);
  try {
    win.print();
  } finally {
    // O Chrome bloqueia em print() até o diálogo fechar; o Safari não — mas lê o título ao abrir.
    win.setTimeout(restore, 1500);
  }
}
