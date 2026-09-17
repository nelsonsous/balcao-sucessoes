import { useEffect, useState } from 'react';
import { Check, Printer, RefreshCw, TriangleAlert } from 'lucide-react';
import type { CalcInput } from '../../engine/succession';
import { updateCase } from '../../lib/actions';
import { calcInputFromCase, readCalc, writeCalc } from '../../lib/calcImport';
import type { CaseRecord } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Button, Card, useConfirm, useDebounced } from '../../components/ui';
import { SuccessionCalculator } from './SuccessionCalculator';
import { PartilhaCard } from '../reports/PartilhaCard';

/** Simulação de quotas do dossier, pré-preenchida a partir dos interessados e do património. */
export function CaseCalcTab({ c }: { c: CaseRecord }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [input, setInput] = useState<CalcInput | null>(() => readCalc(c));
  const [notes, setNotes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const debounced = useDebounced(input, 800);

  // Primeira abertura sem simulação guardada: importa do dossier.
  useEffect(() => {
    if (input) return;
    void calcInputFromCase(c).then(({ input: next, notes: n }) => {
      setInput(next);
      setNotes(n);
    });
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gravação automática (sem inundar o histórico).
  useEffect(() => {
    if (!debounced || c.calcJson === writeCalc(debounced)) return;
    void updateCase(c.id, { calcJson: writeCalc(debounced) }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reimport() {
    const ok = await confirm({
      title: 'Repor a partir do dossier?',
      message: 'A simulação atual é substituída pelos interessados, regime de bens e património registados no dossier.',
      confirmLabel: 'Repor',
    });
    if (!ok) return;
    const { input: next, notes: n } = await calcInputFromCase(c);
    setInput(next);
    setNotes(n);
    toast({ tone: 'success', title: 'Simulação reposta a partir do dossier' });
  }

  if (!input) return <div className="skeleton" style={{ height: 320 }} />;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar no-print">
        <div>
          <h2>Quotas hereditárias</h2>
          <p className="subtle small">Simulação guardada automaticamente neste dossier.</p>
        </div>
        <span className="spacer" />
        {saved && (
          <span className="badge ok">
            <Check aria-hidden /> Guardado
          </span>
        )}
        <Button icon={RefreshCw} onClick={() => void reimport()}>
          Repor do dossier
        </Button>
        <Button icon={Printer} onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      {notes.length > 0 && (
        <Card pad className="no-print">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <TriangleAlert size={16} color="var(--st-curso)" aria-hidden />
            <strong>Rever antes de usar o resultado</strong>
          </div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}
      <SuccessionCalculator value={input} onChange={setInput} />
      <PartilhaCard c={c} input={input} />
    </div>
  );
}
