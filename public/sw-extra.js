// Extensão do service worker gerado pelo Workbox:
// ao tocar numa notificação, foca a aplicação (ou abre-a) na página indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './#/agenda', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch (e) {
              /* navegação entre origens não permitida: fica apenas focada */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

// Web Share Target: a partilha (Android, app instalada) chega como POST multipart a ./share-target.
// Guardamos os ficheiros/ligações numa base IndexedDB própria (o mesmo esquema de src/lib/shareInbox.ts)
// e redirecionamos para a página «Recebidos», onde o utilizador escolhe o dossier.
const SHARE_DB = 'balcao-share-inbox';
function openShareInbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('items')) req.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function storeShared(item) {
  const dbh = await openShareInbox();
  try {
    await new Promise((resolve, reject) => {
      const tx = dbh.transaction('items', 'readwrite');
      tx.objectStore('items').add(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    dbh.close();
  }
}
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return;
  const url = new URL(req.url);
  if (!url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const target = new URL('./#/recebidos', self.registration.scope).href;
      try {
        const form = await req.formData();
        const files = form
          .getAll('files')
          .filter((f) => f && typeof f === 'object' && 'size' in f)
          .map((f) => ({ name: f.name || 'ficheiro', type: f.type || '', size: f.size || 0, blob: f }));
        await storeShared({ title: String(form.get('title') || ''), text: String(form.get('text') || ''), url: String(form.get('url') || ''), files, at: new Date().toISOString() });
      } catch (e) {
        /* sem dados legíveis: abre a página na mesma */
      }
      return Response.redirect(target, 303);
    })(),
  );
});
