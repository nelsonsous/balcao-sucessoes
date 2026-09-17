import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyRound, Paperclip, Share2, Upload } from 'lucide-react';
import { passphraseStrength } from '../../lib/crypto';
import { CASE_TABLES, db } from '../../lib/db';
import { formatBytes } from '../../lib/documents';
import { STRATEGY_LABELS, TABLE_LABELS, describePlan, downloadDossier, importDossier, planDossierImport, readDossierText, type DossierPackage, type ImportPlan, type MergeStrategy } from '../../lib/share';
import type { CaseRecord } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

/** Exportar um dossier para enviar a um colega (com anexos e cifra opcionais). */
export function ShareDossierSheet({ c, open, onClose }: { c: CaseRecord; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const attachments = useLiveQuery(async () => {
    const docs = await db.documents
      .where('caseId')
      .equals(c.id)
      .filter((d) => Boolean(d.fileId))
      .toArray();
    return { count: docs.length, bytes: docs.reduce((s, d) => s + (d.fileSize || 0), 0) };
  }, [c.id]);
  const [includeFiles, setIncludeFiles] = useState(true);
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
      const r = await downloadDossier(c.id, { includeFiles, ...(encrypt ? { passphrase: pass, hint: hint.trim() || undefined } : {}) });
      toast({ tone: 'success', title: 'Dossier exportado para partilha', description: `${r.name} · ${formatBytes(r.bytes)}${encrypt ? ' · só abre com a palavra-passe' : ''}`, duration: 8000 });
      setPass('');
      setAgain('');
      onClose();
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível exportar', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Partilhar dossier com um colega"
      subtitle={`${c.ref} · ${c.name}`}
      icon={Share2}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Share2} disabled={!ok || busy} onClick={() => void run()}>
            Exportar ficheiro
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <p className="small subtle">
          Gera um ficheiro com o dossier completo — questionário, checklist, interessados, património, documentos, agenda, notas e histórico. O colega importa-o em <strong>Dossiers → Importar dossier</strong>; ao juntar com uma versão já existente, nada é apagado.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
          <span>
            <Paperclip size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> Incluir anexos{attachments ? ` (${attachments.count} · ${formatBytes(attachments.bytes)})` : ''}
          </span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>
            <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> Cifrar com palavra-passe (AES-256-GCM) — recomendado
          </span>
        </label>
        {encrypt ? (
          <>
            <Field label="Palavra-passe" htmlFor="sh-pass" hint={pass ? `Força: ${strength.label}` : 'Mínimo 8 caracteres. Combine-a com o colega por outro canal (nunca no mesmo e-mail do ficheiro).'}>
              <input id="sh-pass" className="input" type="password" autoComplete="new-password" value={pass} data-autofocus onChange={(e) => setPass(e.target.value)} />
            </Field>
            <Field label="Repetir a palavra-passe" htmlFor="sh-again" error={again && pass !== again ? 'As palavras-passe não coincidem.' : undefined}>
              <input id="sh-again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </Field>
            <Field label="Pista (opcional)" htmlFor="sh-hint" hint="Guardada em claro no ficheiro — nunca escreva a palavra-passe.">
              <input id="sh-hint" className="input" value={hint} maxLength={80} onChange={(e) => setHint(e.target.value)} />
            </Field>
          </>
        ) : (
          <p className="small subtle">O ficheiro conterá dados pessoais em claro. Envie-o apenas por um canal seguro do escritório.</p>
        )}
      </div>
    </Sheet>
  );
}

const STRATEGIES = Object.keys(STRATEGY_LABELS) as MergeStrategy[];

/** Importar/juntar um dossier partilhado por um colega, com pré-visualização dos conflitos. */
export function ImportDossierSheet({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: (caseId: string) => void }) {
  const toast = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [pass, setPass] = useState('');
  const [hint, setHint] = useState('');
  const [needsPass, setNeedsPass] = useState(false);
  const [pkg, setPkg] = useState<DossierPackage | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>('recente');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setText('');
    setFileName('');
    setPass('');
    setHint('');
    setNeedsPass(false);
    setPkg(null);
    setPlan(null);
    setStrategy('recente');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }
  function close() {
    reset();
    onClose();
  }

  async function analyse(source = text, passphrase = pass) {
    setBusy(true);
    setError('');
    try {
      const r = await readDossierText(source, passphrase || undefined);
      if ('needsPassphrase' in r) {
        setNeedsPass(true);
        setHint(r.hint ?? '');
        return;
      }
      setNeedsPass(false);
      setPkg(r.pkg);
      setPlan(await planDossierImport(r.pkg, strategy));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File) {
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    setPass('');
    await analyse(t, '');
  }

  async function changeStrategy(s: MergeStrategy) {
    setStrategy(s);
    if (pkg) setPlan(await planDossierImport(pkg, s));
  }

  async function run() {
    if (!pkg) return;
    setBusy(true);
    setError('');
    try {
      const r = await importDossier(pkg, strategy);
      toast({
        tone: 'success',
        title: r.created ? 'Dossier importado' : 'Dossier juntado',
        description: `${r.added} registos novos · ${r.updated} atualizados · ${r.kept} mantidos${r.files ? ` · ${r.files} anexo(s)` : ''}${r.missingFiles ? ` · ${r.missingFiles} anexo(s) não incluídos` : ''}`,
        duration: 8000,
      });
      const id = r.caseId;
      close();
      if (onImported) onImported(id);
      else navigate(`/dossiers/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const showStrategies = Boolean(plan && (plan.exists || plan.refClash));

  return (
    <Sheet
      open={open}
      onClose={close}
      variant="modal"
      title="Importar dossier partilhado"
      subtitle="Ficheiro «dossier-….json» exportado por um colega a partir do Balcão das Sucessões."
      icon={Upload}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" icon={Upload} disabled={!plan || busy} onClick={() => void run()}>
            {strategy === 'copia' ? 'Importar como novo' : plan?.exists ? 'Juntar' : 'Importar'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {!pkg && (
          <>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <Button variant="primary" icon={Upload} onClick={() => fileRef.current?.click()}>
                Escolher ficheiro…
              </Button>
              {fileName && <span className="small subtle">{fileName}</span>}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </div>
            {needsPass ? (
              <form
                className="stack"
                style={{ gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pass && !busy) void analyse();
                }}
              >
                <Field label="Palavra-passe do ficheiro" htmlFor="share-pass" hint={hint ? `Pista: ${hint}` : 'O ficheiro está cifrado; peça a palavra-passe a quem o enviou.'} error={error || undefined}>
                  <input id="share-pass" className="input" type="password" autoComplete="current-password" value={pass} data-autofocus onChange={(e) => setPass(e.target.value)} />
                </Field>
                <div>
                  <Button type="submit" variant="primary" icon={KeyRound} disabled={!pass || busy}>
                    Decifrar
                  </Button>
                </div>
              </form>
            ) : (
              <details>
                <summary className="small">Ou colar o conteúdo do ficheiro</summary>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  <Field label="Conteúdo (JSON)" htmlFor="share-json" error={error || undefined}>
                    <textarea id="share-json" className="textarea" rows={5} value={text} placeholder='{"app":"balcao-das-sucessoes/dossier",…}' spellCheck={false} onChange={(e) => setText(e.target.value)} />
                  </Field>
                  <div>
                    <Button disabled={!text.trim() || busy} onClick={() => void analyse()}>
                      Analisar
                    </Button>
                  </div>
                </div>
              </details>
            )}
            {error && !needsPass && !text && <p className="small text-danger">{error}</p>}
          </>
        )}

        {pkg && plan && (
          <>
            <div className="callout">
              <Share2 aria-hidden />
              <div>
                <strong>
                  {pkg.case.ref ? `${pkg.case.ref} · ` : ''}
                  {pkg.case.name}
                </strong>
                <div className="small subtle">
                  Exportado por {pkg.exportedBy}
                  {pkg.exportedAt ? ` em ${formatDateTime(pkg.exportedAt)}` : ''}
                  {pkg.includesFiles ? ` · ${pkg.files.length} anexo(s)` : ' · sem anexos'}
                  {pkg.members.length ? ` · ${pkg.members.length} membro(s) da equipa` : ''}
                </div>
              </div>
            </div>
            <p className="small" data-testid="plan-summary">
              {describePlan(plan)}
            </p>
            {showStrategies && (
              <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
                <legend className="label">Como juntar</legend>
                {STRATEGIES.filter((s) => plan.exists || s === 'recente' || s === 'copia').map((s) => (
                  <label key={s} className="checkbox" style={{ alignItems: 'flex-start' }}>
                    <input type="radio" name="share-strategy" value={s} checked={strategy === s} onChange={() => void changeStrategy(s)} />
                    <span>
                      <strong>{STRATEGY_LABELS[s].label}</strong>
                      <span className="small subtle" style={{ display: 'block' }}>
                        {STRATEGY_LABELS[s].description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Registos por tabela">
              <table className="table small">
                <thead>
                  <tr>
                    <th scope="col">Registos</th>
                    <th scope="col">Novos</th>
                    <th scope="col">Atualizados</th>
                    <th scope="col">Mantidos</th>
                    <th scope="col">Iguais</th>
                  </tr>
                </thead>
                <tbody>
                  {CASE_TABLES.filter((t) => {
                    const p = plan.tables[t];
                    return p.added + p.updated + p.kept + p.same > 0;
                  }).map((t) => {
                    const p = plan.tables[t];
                    return (
                      <tr key={t}>
                        <th scope="row">{TABLE_LABELS[t]}</th>
                        <td>{p.added}</td>
                        <td>{p.updated}</td>
                        <td>{p.kept}</td>
                        <td>{p.same}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row">Total</th>
                    <td>
                      <strong>{plan.totals.added}</strong>
                    </td>
                    <td>
                      <strong>{plan.totals.updated}</strong>
                    </td>
                    <td>
                      <strong>{plan.totals.kept}</strong>
                    </td>
                    <td>
                      <strong>{plan.totals.same}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="tiny subtle">
              {plan.conflicts ? `${plan.conflicts} registo(s) existem nos dois lados com conteúdo diferente. ` : ''}
              {plan.files.added ? `${plan.files.added} anexo(s) novo(s). ` : ''}
              {plan.files.missing ? `${plan.files.missing} documento(s) referem anexos que não vêm no ficheiro — ficam sem anexo. ` : ''}
              {plan.members.added ? `${plan.members.added} membro(s) da equipa serão acrescentados. ` : ''}
              Nada é apagado: o que só existe neste dispositivo mantém-se. A operação fica registada no histórico do dossier.
            </p>
            {error && <p className="small text-danger">{error}</p>}
            <div>
              <Button variant="ghost" onClick={reset}>
                Escolher outro ficheiro
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
