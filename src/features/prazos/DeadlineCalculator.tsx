import { useMemo, useState } from 'react';
import { CalendarClock, Check, Sparkles } from 'lucide-react';
import { COMMON_DEADLINES, UNIT_LABELS, countDeadline, describeCount, type CountSpec, type CountUnit } from '../../engine/prazos';
import { useHolidayCalendar } from '../../lib/agenda';
import { formatDate, todayIso } from '../../lib/utils';
import { Button, Field, Menu } from '../../components/ui';

export interface DeadlineApply {
  dueDate: string;
  label: string;
}

/** Calculadora de prazos (dias corridos/úteis, meses, anos, suspensão judicial). */
export function DeadlineCalculator({ initialStart, onApply, applyLabel = 'Usar este prazo' }: { initialStart?: string; onApply?: (r: DeadlineApply) => void; applyLabel?: string }) {
  const calendar = useHolidayCalendar();
  const [start, setStart] = useState(initialStart || todayIso());
  const [count, setCount] = useState(10);
  const [unit, setUnit] = useState<CountUnit>('dias');
  const [judicial, setJudicial] = useState(false);
  const [move, setMove] = useState(true);
  const spec: CountSpec = useMemo(() => ({ start, count, unit, judicial, moveToBusinessDay: move }), [start, count, unit, judicial, move]);
  const r = useMemo(() => countDeadline(spec, calendar), [spec, calendar]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="form-grid">
        <Field label="A contar de" htmlFor="dl-start" hint="Data do facto (citação, notificação, óbito…). O próprio dia não conta.">
          <input id="dl-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Prazo" htmlFor="dl-count">
          <div className="row" style={{ gap: 6 }}>
            <input id="dl-count" type="number" min={1} max={3650} className="input" style={{ width: 90 }} value={count} onChange={(e) => setCount(Math.max(0, Number(e.target.value)))} />
            <select className="select" aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as CountUnit)}>
              {(Object.keys(UNIT_LABELS) as CountUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <div className="stack span-2" style={{ gap: 8 }}>
          <label className="checkbox">
            <input type="checkbox" checked={judicial} onChange={(e) => setJudicial(e.target.checked)} />
            Prazo judicial — suspende-se nas férias judiciais (art. 138.º CPC)
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
            Transferir para o 1.º dia útil seguinte quando o termo cai em dia não útil (art. 279.º, al. e) CC)
          </label>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <Menu
          ariaLabel="Prazos frequentes"
          items={COMMON_DEADLINES.map((d) => ({
            label: d.label,
            description: `${d.count} ${UNIT_LABELS[d.unit]}${d.judicial ? ' · judicial' : ''} — ${d.note}`,
            icon: Sparkles,
            onSelect: () => {
              setCount(d.count);
              setUnit(d.unit);
              setJudicial(d.judicial);
            },
          }))}
          button={(p) => (
            <button type="button" className="btn sm" {...p}>
              <Sparkles aria-hidden /> Prazos frequentes
            </button>
          )}
        />
      </div>
      <div className="law-result">
        {r.valid ? (
          <>
            <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
              <CalendarClock size={16} aria-hidden />
              <strong style={{ fontSize: 16 }}>Termo: {formatDate(r.final, 'long')}</strong>
              {r.final !== r.end && <span className="badge warn">calculado {formatDate(r.end)} → transferido</span>}
            </div>
            <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {r.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p className="tiny subtle" style={{ marginTop: 6 }}>
              {r.legal.join(' · ')} — regras gerais; confirme o regime especial do prazo em causa.
            </p>
          </>
        ) : (
          <p className="small subtle">{r.steps[0]}</p>
        )}
      </div>
      {onApply && (
        <div>
          <Button variant="primary" icon={Check} disabled={!r.valid} onClick={() => onApply({ dueDate: r.final, label: describeCount(spec, r) })}>
            {applyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
