import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { Square } from 'lucide-react';
import { db, useSettings } from '../lib/db';
import { formatDuration, stopTimer } from '../lib/fees';
import { useToast } from './Toast';

/** Cronómetro em curso, visível em toda a aplicação (barra superior): abre o dossier ou para e regista. */
export function TimerChip() {
  const { activeTimer } = useSettings();
  const toast = useToast();
  const c = useLiveQuery(async () => (activeTimer ? db.cases.get(activeTimer.caseId) : undefined), [activeTimer?.caseId]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTimer) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [activeTimer]);
  if (!activeTimer || !c) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(activeTimer.startedAt).getTime()) / 60_000));
  return (
    <span className="row" style={{ gap: 4 }} data-testid="timer-chip">
      <Link href={`/dossiers/${c.id}/honorarios`} className="timer-chip" title={`Cronómetro em curso: ${activeTimer.description || 'trabalho no dossier'} — ${c.name}`}>
        <span className="dot-live" aria-hidden />
        <span className="tabular">{formatDuration(minutes)}</span>
        <span className="desktop-only">· {c.ref}</span>
      </Link>
      <button
        type="button"
        className="btn ghost sm icon"
        aria-label="Parar o cronómetro e registar o tempo"
        title="Parar e registar"
        onClick={() =>
          void (async () => {
            const e = await stopTimer();
            if (e) toast({ tone: 'success', title: `Registado: ${formatDuration(e.minutes)}`, description: `${c.ref} · ${e.description}` });
          })()
        }
      >
        <Square aria-hidden />
      </button>
    </span>
  );
}
