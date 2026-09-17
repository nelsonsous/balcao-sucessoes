import { useEffect, useState } from 'react';
import { FolderOpen, FolderSync, HardDriveDownload, Info, KeyRound, ShieldAlert } from 'lucide-react';
import { EVERY_LABELS, autoBackupTick, hasPermission, listAutoBackups, loadDirectory, pickDirectory, saveDirectory, supportsDirectoryPicker, type AutoBackupEvery } from '../../lib/autoBackup';
import { passphraseStrength } from '../../lib/crypto';
import { setSetting, useSettings } from '../../lib/db';
import { formatDateTime } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Field } from '../../components/ui';

const KEEP_OPTIONS = [5, 10, 20, 50];

/** Cópias de segurança automáticas, cifradas, para uma pasta do dispositivo (Chrome/Edge em computador). */
export function AutoBackupCard() {
  const settings = useSettings();
  const toast = useToast();
  const supported = supportsDirectoryPicker();
  const [pass, setPass] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inFolder, setInFolder] = useState<string[] | null>(null);
  useEffect(() => {
    if (!dirty) setPass(settings.autoBackupPass);
  }, [settings.autoBackupPass, dirty]);

  const hasDir = Boolean(settings.autoBackupDirName);
  const passOk = settings.autoBackupPass.length >= 8;
  const canEnable = hasDir && passOk;
  const needsPermission = settings.autoBackupLastError === 'permissao';
  const strength = passphraseStrength(pass);

  async function savePass() {
    setDirty(false);
    if (pass === settings.autoBackupPass) return;
    await setSetting('autoBackupPass', pass);
    if (pass.length < 8 && settings.autoBackupEnabled) await setSetting('autoBackupEnabled', false);
  }

  async function choose() {
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      await saveDirectory(dir);
      await setSetting('autoBackupLastError', '');
      setInFolder(await listAutoBackups(dir));
      toast({ tone: 'success', title: 'Pasta escolhida', description: dir.name });
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível usar a pasta', description: (e as Error).message });
    }
  }

  async function authorize() {
    const dir = await loadDirectory();
    if (!dir) return;
    if (await hasPermission(dir, true)) {
      await setSetting('autoBackupLastError', '');
      setInFolder(await listAutoBackups(dir));
      toast({ tone: 'success', title: 'Pasta autorizada', description: 'As cópias automáticas retomam no próximo ciclo.' });
    } else toast({ tone: 'error', title: 'Autorização recusada' });
  }

  async function copyNow() {
    setBusy(true);
    try {
      const dir = await loadDirectory();
      if (!dir) return;
      await hasPermission(dir, true);
      const r = await autoBackupTick({ dir, force: true });
      if (r.status === 'feito' && r.result) {
        toast({ tone: 'success', title: 'Cópia guardada na pasta', description: `${r.result.name} · ${r.result.cases} dossier(s)${r.result.removed.length ? ` · ${r.result.removed.length} antiga(s) apagada(s)` : ''}`, duration: 8000 });
        setInFolder(await listAutoBackups(dir));
      } else toast({ tone: 'error', title: 'Não foi possível copiar', description: r.error ?? (r.status === 'sem-permissao' ? 'A pasta não está autorizada.' : r.status) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="span-2">
      <CardHead
        icon={FolderSync}
        title="Cópias automáticas"
        subtitle="Cópias cifradas guardadas numa pasta do dispositivo. Se a pasta estiver sincronizada (OneDrive, SharePoint, Google Drive, NAS), o escritório fica com um repositório central de cópias sem servidor próprio."
      />
      <div className="card-body stack" style={{ gap: 14 }}>
        {!supported ? (
          <div className="callout">
            <Info aria-hidden />
            <div>Este navegador não permite escrever numa pasta do dispositivo (funciona no Chrome e no Edge, em computador). Em alternativa, exporte cópias manualmente ou partilhe dossiers por ficheiro.</div>
          </div>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className={settings.autoBackupEnabled ? 'badge ok' : 'badge'}>
                <FolderSync aria-hidden /> {settings.autoBackupEnabled ? 'Ativas' : 'Desligadas'}
              </span>
              <span className="badge">
                <FolderOpen aria-hidden /> {hasDir ? `Pasta: ${settings.autoBackupDirName}` : 'Sem pasta escolhida'}
              </span>
              {settings.lastAutoBackupAt && <span className="badge">Última cópia automática: {formatDateTime(settings.lastAutoBackupAt)}</span>}
              {needsPermission && (
                <span className="badge warn">
                  <ShieldAlert aria-hidden /> A pasta precisa de autorização
                </span>
              )}
              {settings.autoBackupLastError && !needsPermission && <span className="badge warn">Última tentativa falhou: {settings.autoBackupLastError}</span>}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Button size="sm" icon={FolderOpen} onClick={() => void choose()}>
                {hasDir ? 'Mudar pasta…' : 'Escolher pasta…'}
              </Button>
              {needsPermission && (
                <Button size="sm" variant="primary" icon={ShieldAlert} onClick={() => void authorize()}>
                  Autorizar pasta
                </Button>
              )}
              <Button size="sm" variant="soft" icon={HardDriveDownload} disabled={!hasDir || !passOk || busy} onClick={() => void copyNow()}>
                Copiar agora
              </Button>
            </div>
            <div className="form-grid">
              <Field label="Palavra-passe das cópias" htmlFor="ab-pass" hint={pass ? `Força: ${strength.label} · fica só neste dispositivo` : 'Mínimo 8 caracteres. Fica só neste dispositivo; os ficheiros na pasta só abrem com ela.'} error={pass && pass.length < 8 ? 'Mínimo 8 caracteres.' : undefined}>
                <input
                  id="ab-pass"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={pass}
                  onChange={(e) => {
                    setDirty(true);
                    setPass(e.target.value);
                  }}
                  onBlur={() => void savePass()}
                />
              </Field>
              <Field label="Frequência" htmlFor="ab-every">
                <select id="ab-every" className="select" value={settings.autoBackupEvery} onChange={(e) => void setSetting('autoBackupEvery', e.target.value as AutoBackupEvery)}>
                  {(Object.keys(EVERY_LABELS) as AutoBackupEvery[]).map((k) => (
                    <option key={k} value={k}>
                      {EVERY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cópias a manter na pasta" htmlFor="ab-keep" hint="As mais antigas são apagadas automaticamente.">
                <select id="ab-keep" className="select" value={settings.autoBackupKeep} onChange={(e) => void setSetting('autoBackupKeep', Number(e.target.value))}>
                  {KEEP_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="stack" style={{ gap: 10, justifyContent: 'flex-end' }}>
                <label className="checkbox">
                  <input type="checkbox" checked={settings.autoBackupFiles} onChange={(e) => void setSetting('autoBackupFiles', e.target.checked)} />
                  Incluir anexos
                </label>
                <label className="checkbox">
                  <input type="checkbox" disabled={!canEnable} checked={settings.autoBackupEnabled} onChange={(e) => void setSetting('autoBackupEnabled', e.target.checked)} />
                  <span>
                    <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> Ativar cópias automáticas{!canEnable ? ' (escolha a pasta e defina a palavra-passe)' : ''}
                  </span>
                </label>
              </div>
            </div>
            {inFolder && <p className="tiny subtle">{inFolder.length ? `${inFolder.length} cópia(s) na pasta · mais recente: ${inFolder[inFolder.length - 1]}` : 'Ainda não há cópias na pasta.'}</p>}
            <p className="tiny subtle">
              A cópia corre com a aplicação aberta (ao arrancar, a cada minuto e ao mudar de separador), só quando há alterações desde a última. O navegador pode pedir para reautorizar a pasta em cada sessão — a aplicação avisa. Para repor uma cópia: Dados e privacidade → Importar cópia.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
