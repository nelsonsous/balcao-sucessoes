import { useEffect } from 'react';
import { autoBackupTick, hasPermission, loadDirectory, supportsDirectoryPicker } from '../lib/autoBackup';
import { useSettings } from '../lib/db';
import { useToast } from './Toast';

/** Agendador das cópias automáticas: ao arrancar, a cada minuto e quando a aplicação deixa de estar visível. */
export function AutoBackupRunner() {
  const settings = useSettings();
  const toast = useToast();
  const enabled = settings.autoBackupEnabled;

  useEffect(() => {
    if (!enabled || !supportsDirectoryPicker()) return;
    let warned = '';
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const r = await autoBackupTick();
        if (r.status === 'sem-permissao' && warned !== 'permissao') {
          warned = 'permissao';
          toast({
            key: 'auto-backup',
            title: 'Cópias automáticas: a pasta precisa de autorização',
            description: 'O navegador pede confirmação de acesso à pasta em cada sessão.',
            duration: 15_000,
            action: {
              label: 'Autorizar',
              onClick: () => {
                void (async () => {
                  const dir = await loadDirectory();
                  if (dir && (await hasPermission(dir, true))) {
                    warned = '';
                    const again = await autoBackupTick();
                    if (again.status === 'feito' && again.result) toast({ key: 'auto-backup', tone: 'success', title: 'Cópia automática guardada', description: again.result.name });
                    else toast({ key: 'auto-backup', tone: 'success', title: 'Pasta autorizada' });
                  }
                })();
              },
            },
          });
        } else if (r.status === 'erro' && warned !== r.error) {
          warned = r.error ?? 'erro';
          toast({ key: 'auto-backup', tone: 'error', title: 'A cópia automática falhou', description: r.error, duration: 10_000 });
        } else if (r.status === 'feito' && r.result) {
          warned = '';
          toast({ key: 'auto-backup', tone: 'success', title: 'Cópia automática guardada', description: `${r.result.name} · ${r.result.cases} dossier(s)`, duration: 5000 });
        }
      } finally {
        running = false;
      }
    };
    const first = setTimeout(() => void run(), 4000);
    const timer = setInterval(() => void run(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, toast]);

  return null;
}
