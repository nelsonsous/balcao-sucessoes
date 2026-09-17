import { useState } from 'react';
import { EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { hashPin, verifyPin, type PinRecord } from '../../lib/crypto';
import { setSetting, useSettings } from '../../lib/db';
import { clearPin, lockNow } from '../../lib/lock';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Field, Sheet, useConfirm } from '../../components/ui';

const AUTO_LOCK: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Nunca' },
  { value: 1, label: 'Após 1 minuto' },
  { value: 5, label: 'Após 5 minutos' },
  { value: 15, label: 'Após 15 minutos' },
  { value: 30, label: 'Após 30 minutos' },
];

/** Segurança e privacidade: PIN, auto-bloqueio, modo privacidade. */
export function SecurityCard() {
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const hasPin = Boolean(settings.pinJson);

  async function removePin() {
    const ok = await confirm({ title: 'Remover o PIN?', message: 'A aplicação deixa de pedir PIN ao abrir e após inatividade.', confirmLabel: 'Remover PIN', danger: true });
    if (!ok) return;
    await clearPin();
    toast({ title: 'PIN removido' });
  }

  return (
    <Card>
      <CardHead icon={ShieldCheck} title="Segurança e privacidade" subtitle="Bloqueio por PIN neste dispositivo e ocultação de nomes para partilhar o ecrã." />
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={hasPin ? 'badge ok' : 'badge'}>
            <LockKeyhole aria-hidden /> {hasPin ? 'PIN definido' : 'Sem PIN'}
          </span>
          <Button size="sm" icon={KeyRound} onClick={() => setOpen(true)}>
            {hasPin ? 'Alterar PIN' : 'Definir PIN'}
          </Button>
          {hasPin && (
            <>
              <Button size="sm" variant="ghost" onClick={() => void removePin()}>
                Remover PIN
              </Button>
              <Button size="sm" variant="soft" icon={LockKeyhole} onClick={() => lockNow()}>
                Bloquear agora
              </Button>
            </>
          )}
        </div>
        <div className="form-grid">
          <Field label="Bloquear automaticamente" htmlFor="s-autolock" hint={hasPin ? 'Sem interação durante este tempo, pede o PIN.' : 'Defina um PIN para ativar.'}>
            <select id="s-autolock" className="select" disabled={!hasPin} value={settings.autoLockMinutes} onChange={(e) => void setSetting('autoLockMinutes', Number(e.target.value))}>
              {AUTO_LOCK.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="stack" style={{ gap: 10, justifyContent: 'flex-end' }}>
            <label className="checkbox">
              <input type="checkbox" disabled={!hasPin} checked={settings.lockOnHide} onChange={(e) => void setSetting('lockOnHide', e.target.checked)} />
              Bloquear ao mudar de aplicação ou separador
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={settings.privacyMode} onChange={(e) => void setSetting('privacyMode', e.target.checked)} />
              <span>
                <EyeOff size={13} style={{ verticalAlign: '-2px' }} aria-hidden /> Modo privacidade (oculta nomes nas listas, no painel e nos documentos)
              </span>
            </label>
          </div>
        </div>
        <p className="tiny subtle">
          O PIN protege contra acessos casuais neste dispositivo; não cifra a base de dados local. Para proteger os dados em repouso, use a encriptação do sistema (FileVault/BitLocker), sessões pessoais e cópias de segurança cifradas.
        </p>
      </div>
      <PinSheet open={open} onClose={() => setOpen(false)} hasPin={hasPin} current={settings.pinJson} />
    </Card>
  );
}

function PinSheet({ open, onClose, hasPin, current }: { open: boolean; onClose: () => void; hasPin: boolean; current: string }) {
  const toast = useToast();
  const [old, setOld] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4,8}$/.test(pin) && pin === again && (!hasPin || old.length >= 4);

  const reset = () => {
    setOld('');
    setPin('');
    setAgain('');
    setError('');
  };

  async function save() {
    setBusy(true);
    try {
      if (hasPin) {
        const rec = JSON.parse(current) as PinRecord;
        if (!(await verifyPin(old, rec))) {
          setError('O PIN atual não está correto.');
          return;
        }
      }
      if (/^(\d)\1+$/.test(pin) || pin === '1234' || pin === '0000' || pin === '123456') {
        setError('Escolha um PIN menos óbvio.');
        return;
      }
      await setSetting('pinJson', JSON.stringify(await hashPin(pin)));
      if (!hasPin) await setSetting('autoLockMinutes', 15);
      toast({ tone: 'success', title: hasPin ? 'PIN alterado' : 'PIN definido', description: 'A aplicação passa a pedir o PIN ao abrir.' });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      variant="modal"
      title={hasPin ? 'Alterar PIN' : 'Definir PIN'}
      subtitle="4 a 8 algarismos. Guarde-o em local seguro: sem o PIN não é possível entrar sem apagar os dados."
      icon={KeyRound}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => void save()}>
            Guardar PIN
          </Button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void save();
        }}
      >
        {hasPin && (
          <Field label="PIN atual" htmlFor="pin-old">
            <input id="pin-old" className="input" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={old} data-autofocus onChange={(e) => setOld(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <Field label="Novo PIN" htmlFor="pin-new">
          <input id="pin-new" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} data-autofocus={!hasPin ? true : undefined} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Repetir o novo PIN" htmlFor="pin-again" error={again && pin !== again ? 'Os PIN não coincidem.' : error || undefined}>
          <input id="pin-again" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
