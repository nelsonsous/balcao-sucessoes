import { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useSettings } from '../lib/db';
import { lockNow, tryUnlock, useLock, watchIdle } from '../lib/lock';

/** Ecrã de bloqueio por PIN (cobre toda a aplicação) e auto-bloqueio. */
export function LockScreen() {
  const settings = useSettings();
  const lock = useLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hasPin = Boolean(settings.pinJson);

  // Auto-bloqueio por inatividade e ao esconder a aplicação.
  useEffect(() => {
    if (!hasPin) return;
    const stop = watchIdle(settings.autoLockMinutes, lockNow);
    const onHide = () => {
      if (settings.lockOnHide && document.visibilityState === 'hidden') lockNow();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [hasPin, settings.autoLockMinutes, settings.lockOnHide]);

  useEffect(() => {
    if (lock.locked) {
      setPin('');
      setError('');
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [lock.locked]);

  // Contagem decrescente da espera após tentativas falhadas.
  useEffect(() => {
    if (!lock.until) {
      setWait(0);
      return;
    }
    const tick = () => setWait(Math.max(0, Math.ceil((lock.until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [lock.until]);

  if (!hasPin || !lock.locked) return null;

  const submit = async () => {
    if (pin.length < 4) return;
    const r = await tryUnlock(pin);
    if (!r.ok) {
      setPin('');
      setError(r.waitSeconds ? `PIN incorreto. Aguarde ${r.waitSeconds} s antes de tentar de novo.` : 'PIN incorreto.');
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <div className="lock-card">
        <span className="brand-mark lock-mark" aria-hidden>
          BS
        </span>
        <h1 id="lock-title">Balcão das Sucessões</h1>
        <p className="subtle">
          <Lock size={14} style={{ verticalAlign: '-2px' }} aria-hidden /> Introduza o PIN para continuar.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={input}
            className="input lock-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={8}
            aria-label="PIN"
            placeholder="••••"
            value={pin}
            disabled={wait > 0}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
          />
          <button type="submit" className="btn primary block" disabled={pin.length < 4 || wait > 0}>
            {wait > 0 ? `Aguarde ${wait} s` : 'Desbloquear'}
          </button>
        </form>
        {error && (
          <p className="lock-error" role="alert">
            {error}
          </p>
        )}
        <p className="tiny subtle lock-foot">
          <ShieldCheck size={12} style={{ verticalAlign: '-2px' }} aria-hidden /> Os dados continuam apenas neste dispositivo. Se se esqueceu do PIN, a única alternativa é apagar os dados
          do navegador e repor uma cópia de segurança.
        </p>
      </div>
    </div>
  );
}
