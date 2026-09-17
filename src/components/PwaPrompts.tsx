import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './Toast';

/** Avisos do service worker: pronto offline e nova versão disponível. */
export function PwaPrompts() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Verifica atualizações de hora a hora enquanto a app estiver aberta.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast({ key: 'pwa-offline', tone: 'success', title: 'Pronto para funcionar offline', description: 'A aplicação fica disponível mesmo sem internet.' });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (!needRefresh) return;
    toast({
      key: 'pwa-update',
      title: 'Nova versão disponível',
      description: 'Atualize para obter as últimas melhorias.',
      duration: 0,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, toast, updateServiceWorker]);

  return null;
}
