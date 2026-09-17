// Pilha de «anular» da sessão: cada ação reversível (mudança de estado, remoção…) regista aqui
// como se desfaz. A interface mostra um aviso com o botão «Anular»; Ctrl/⌘+Z desfaz a última.
export interface UndoEntry {
  id: number;
  title: string;
  description?: string;
  at: number;
  undo: () => Promise<void>;
}

const MAX = 30;
const stack: UndoEntry[] = [];
const listeners = new Set<(e: UndoEntry) => void>();
let seq = 0;

/** Regista uma ação reversível. Devolve a entrada (para a interface poder anulá-la em concreto). */
export function pushUndo(title: string, undo: () => Promise<void>, description?: string): UndoEntry {
  const entry: UndoEntry = { id: ++seq, title, at: Date.now(), undo, ...(description ? { description } : {}) };
  stack.push(entry);
  if (stack.length > MAX) stack.splice(0, stack.length - MAX);
  for (const l of listeners) l(entry);
  return entry;
}

/** Anula a última ação registada (se houver). */
export async function undoLast(): Promise<UndoEntry | null> {
  const e = stack.pop();
  if (!e) return null;
  await e.undo();
  return e;
}

/** Anula uma ação específica, se ainda estiver na pilha. */
export async function undoEntry(id: number): Promise<UndoEntry | null> {
  const i = stack.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [e] = stack.splice(i, 1);
  await e!.undo();
  return e!;
}

export const undoCount = (): number => stack.length;
export const peekUndo = (): UndoEntry | null => stack[stack.length - 1] ?? null;

/** Recebe cada nova entrada (para mostrar o aviso com «Anular»). */
export function onUndo(listener: (e: UndoEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearUndo(): void {
  stack.length = 0;
}
