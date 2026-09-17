// Caixa de entrada de partilhas (Web Share Target): o service worker recebe os ficheiros/ligações
// partilhados para a aplicação (Android, app instalada) e guarda-os aqui; a página «Recebidos»
// deixa anexá-los a um dossier. Base IndexedDB própria e mínima, partilhada com o service worker
// (que não pode usar o Dexie) — o esquema tem de coincidir com o de public/sw-extra.js.
import { useEffect, useState } from 'react';

export const SHARE_INBOX_DB = 'balcao-share-inbox';
const STORE = 'items';
export const INBOX_EVENT = 'bs-inbox-changed';

export interface SharedFile {
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

export interface SharedItem {
  id?: number;
  title: string;
  text: string;
  url: string;
  files: SharedFile[];
  at: string;
}

function openInbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_INBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const dbh = await openInbox();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = dbh.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('Falha na caixa de entrada'));
      tx.onabort = () => reject(tx.error ?? new Error('Falha na caixa de entrada'));
    });
  } finally {
    dbh.close();
  }
}

export const listInbox = (): Promise<SharedItem[]> => run('readonly', (s) => s.getAll() as IDBRequest<SharedItem[]>);
export const inboxCount = (): Promise<number> => run('readonly', (s) => s.count());
export const addInbox = (item: Omit<SharedItem, 'id'>): Promise<number> => run('readwrite', (s) => s.add(item) as IDBRequest<number>);
export const removeInbox = (id: number): Promise<undefined> => run('readwrite', (s) => s.delete(id));
export const clearInbox = (): Promise<undefined> => run('readwrite', (s) => s.clear());

/** Avisa a interface de que a caixa de entrada mudou. */
export function notifyInbox(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INBOX_EVENT));
}

/** Reconstrói um File a partir do que foi guardado (o service worker guarda o blob e os metadados). */
export function toFile(f: SharedFile): File {
  return new File([f.blob], f.name || 'ficheiro', { type: f.type || f.blob.type || 'application/octet-stream' });
}

/** Título curto de um item recebido, para listas e avisos. */
export function itemTitle(it: SharedItem): string {
  return it.title || it.files[0]?.name || it.url || (it.text ? it.text.slice(0, 60) : 'Partilha recebida');
}

/** Número de itens por tratar; atualiza ao voltar à aplicação e quando a caixa muda. */
export function useInboxCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      inboxCount()
        .then((c) => {
          if (alive) setN(c);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(INBOX_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(INBOX_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return n;
}
