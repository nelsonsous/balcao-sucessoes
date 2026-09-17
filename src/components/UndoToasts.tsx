import { useEffect } from 'react';
import { onUndo, undoEntry, undoLast } from '../lib/undo';
import { useToast } from './Toast';

const isEditable = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
};

/** Mostra «Anular» para cada ação reversível e desfaz a última com Ctrl/⌘+Z fora de campos de texto. */
export function UndoToasts() {
  const toast = useToast();

  useEffect(
    () =>
      onUndo((e) => {
        toast({
          key: 'undo',
          title: e.title,
          description: e.description,
          duration: 8000,
          action: {
            label: 'Anular',
            onClick: () => {
              void undoEntry(e.id)
                .then((done) => {
                  if (done) toast({ key: 'undo', tone: 'success', title: 'Anulado', description: e.title, duration: 3000 });
                  else toast({ key: 'undo', title: 'Já não é possível anular esta ação', duration: 3000 });
                })
                .catch((err: unknown) => toast({ key: 'undo', tone: 'error', title: 'Não foi possível anular', description: (err as Error).message }));
            },
          },
        });
      }),
    [toast],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.shiftKey || ev.altKey || ev.key.toLowerCase() !== 'z') return;
      if (isEditable(document.activeElement) || document.querySelector('dialog[open]')) return;
      ev.preventDefault();
      void undoLast()
        .then((e) => {
          if (e) toast({ key: 'undo', tone: 'success', title: 'Anulado', description: e.title, duration: 3000 });
          else toast({ key: 'undo', title: 'Nada para anular', duration: 2000 });
        })
        .catch((err: unknown) => toast({ key: 'undo', tone: 'error', title: 'Não foi possível anular', description: (err as Error).message }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  return null;
}
