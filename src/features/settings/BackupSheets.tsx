import { useState } from 'react';
import { Download, FileUp, KeyRound, Upload } from 'lucide-react';
import { downloadBackup } from '../../lib/backup';
import { passphraseStrength } from '../../lib/crypto';
import { LEGACY_SNIPPET, importLegacy, parseLegacy } from '../../lib/legacy';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

/** Exportação com opção de cifra por palavra-passe. */
export function ExportSheet({ open, onClose, includeFiles }: { open: boolean; onClose: () => void; includeFiles: boolean }) {
  const toast = useToast();
  const [encrypt, setEncrypt] = useState(true);
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = passphraseStrength(pass);
  const ok = !encrypt || (pass.length >= 8 && pass === again);

  async function run() {
    setBusy(true);
    try {
      const n = await downloadBackup({ includeFiles, ...(encrypt ? { passphrase: pass, hint: hint.trim() || undefined } : {}) });
      toast({ tone: 'success', title: encrypt ? 'Cópia cifrada exportada' : 'Cópia de segurança exportada', description: `${n} dossier(s)${encrypt ? ' · só abre com a palavra-passe' : ''}` });
      setPass('');
      setAgain('');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Exportar cópia de segurança"
      subtitle={includeFiles ? 'Inclui os anexos.' : 'Sem anexos.'}
      icon={Download}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Download} disabled={!ok || busy} onClick={() => void run()}>
            Exportar
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <label className="checkbox">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>
            <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> Cifrar com palavra-passe (AES-256-GCM) — recomendado
          </span>
        </label>
        {encrypt && (
          <>
            <Field label="Palavra-passe" htmlFor="bk-pass" hint={pass ? `Força: ${strength.label}` : 'Mínimo 8 caracteres. Sem ela, a cópia não pode ser lida por ninguém — nem por nós.'}>
              <input id="bk-pass" className="input" type="password" autoComplete="new-password" value={pass} data-autofocus onChange={(e) => setPass(e.target.value)} />
            </Field>
            <Field label="Repetir a palavra-passe" htmlFor="bk-again" error={again && pass !== again ? 'As palavras-passe não coincidem.' : undefined}>
              <input id="bk-again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </Field>
            <Field label="Pista (opcional)" htmlFor="bk-hint" hint="Guardada em claro no ficheiro — nunca escreva a palavra-passe.">
              <input id="bk-hint" className="input" value={hint} maxLength={80} onChange={(e) => setHint(e.target.value)} />
            </Field>
          </>
        )}
        {!encrypt && <p className="small subtle">O ficheiro conterá dados pessoais em claro. Guarde-o em local seguro do escritório.</p>}
      </div>
    </Sheet>
  );
}

/** Pedido de palavra-passe ao importar uma cópia cifrada. */
export function PassphraseSheet({ open, hint, onSubmit, onClose }: { open: boolean; hint?: string; onSubmit: (pass: string) => Promise<boolean>; onClose: () => void }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setError('');
    try {
      const ok = await onSubmit(pass);
      if (!ok) setError('Palavra-passe incorreta.');
      else setPass('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Cópia cifrada"
      subtitle="Introduza a palavra-passe usada ao exportar."
      icon={KeyRound}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!pass || busy} onClick={() => void go()}>
            Decifrar e importar
          </Button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (pass && !busy) void go();
        }}
      >
        {hint && (
          <p className="small subtle">
            Pista: <strong>{hint}</strong>
          </p>
        )}
        <Field label="Palavra-passe" htmlFor="imp-pass" error={error || undefined}>
          <input id="imp-pass" className="input" type="password" autoComplete="current-password" value={pass} data-autofocus onChange={(e) => setPass(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

/** Importação do protótipo original (HTML único com localStorage). */
export function LegacyImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const payload = parseLegacy(text);
      const r = await importLegacy(payload);
      toast({
        tone: 'success',
        title: `${r.cases} dossier(s) importado(s) do protótipo`,
        description: `${r.tasksMatched} tarefas reconhecidas, ${r.tasksAdded} acrescentadas · ${r.parties} interessados · ${r.assets} bens · ${r.contacts} contactos`,
        duration: 12_000,
      });
      setText('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Importar do protótipo"
      subtitle="Traz os dossiers, respostas, estados das tarefas, interessados, bens, notas e contactos do protótipo em HTML."
      icon={FileUp}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Upload} disabled={!text.trim() || busy} onClick={() => void run()}>
            Importar
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Abra o protótipo no navegador onde foi usado.</li>
          <li>
            Abra a consola (F12 → Consola) e cole este comando — copia os dados para a área de transferência:
            <pre className="code-block">{LEGACY_SNIPPET}</pre>
          </li>
          <li>Cole aqui o resultado.</li>
        </ol>
        <Field label="Dados do protótipo (JSON)" htmlFor="legacy-json" error={error || undefined}>
          <textarea id="legacy-json" className="textarea" rows={6} value={text} placeholder='{"cases":[…],"notes":{…}}' onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </Field>
        <p className="tiny subtle">Os dossiers importados ficam com a etiqueta «Importado». As respostas ao questionário são convertidas; o que o protótipo não sabia fica «por responder».</p>
      </div>
    </Sheet>
  );
}
