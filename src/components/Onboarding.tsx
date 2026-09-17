import { useState } from 'react';
import { Lock, Sparkles, WifiOff } from 'lucide-react';
import { requestPersistence, setSetting, useSettings } from '../lib/db';
import { loadDemoData } from '../lib/demo';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Button, Field, Sheet } from './ui';
import { useToast } from './Toast';

/** Boas-vindas no primeiro arranque: nome, privacidade e dados de demonstração. */
export function Onboarding() {
  const settings = useSettings();
  const loaded = useLiveQuery(() => db.settings.count(), []);
  const hasCases = useLiveQuery(() => db.cases.count(), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const open = loaded !== undefined && hasCases !== undefined && !settings.onboarded && hasCases === 0;

  async function finish(demo: boolean) {
    setBusy(true);
    try {
      if (name.trim()) await setSetting('userName', name.trim());
      await setSetting('onboarded', true);
      void requestPersistence();
      if (demo) {
        const n = await loadDemoData();
        toast({ tone: 'success', title: 'Pronto!', description: `${n} dossiers fictícios para explorar` });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => void finish(false)}
      variant="modal"
      title="Boas-vindas ao Balcão das Sucessões"
      subtitle="Organizar. Acompanhar. Identificar o próximo passo."
      footer={
        <>
          <Button variant="ghost" onClick={() => void finish(false)} disabled={busy}>
            Começar do zero
          </Button>
          <span className="spacer" />
          <Button variant="primary" icon={Sparkles} onClick={() => void finish(true)} disabled={busy}>
            Explorar com dados fictícios
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Field label="Como se chama?" htmlFor="ob-name" hint="Aparece na saudação e no histórico das alterações.">
          <input
            id="ob-name"
            className="input"
            data-autofocus
            value={name}
            placeholder="Ex.: Ana Marques"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void finish(false)}
          />
        </Field>
        <div className="onb-points">
          <div>
            <Lock aria-hidden />
            <span>
              <strong>Privado por natureza.</strong> Os dados ficam só neste dispositivo — nada é enviado para servidores.
            </span>
          </div>
          <div>
            <WifiOff aria-hidden />
            <span>
              <strong>Funciona sem internet.</strong> Instale como aplicação e use em qualquer lado.
            </span>
          </div>
          <div>
            <Sparkles aria-hidden />
            <span>
              <strong>Checklist inteligente.</strong> Cada resposta do questionário gera o trabalho aplicável, com prazos e referências.
            </span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
