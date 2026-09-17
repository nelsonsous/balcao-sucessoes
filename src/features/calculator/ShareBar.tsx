import { useRef, useState } from 'react';
import type { HeirShare } from '../../engine/succession';
import { fmtPct, prettyFrac, toNumber } from '../../engine/fraction';
import { formatEur } from '../../lib/utils';

/** Oito posições categóricas, por ordem fixa (validadas para daltonismo em claro e escuro). */
export const SERIES_COUNT = 8;
export const seriesVar = (i: number) => `var(--series-${(i % SERIES_COUNT) + 1})`;

interface Tip {
  x: number;
  y: number;
  share: HeirShare;
  color: string;
}

/** Barra 100% empilhada: quota de cada herdeiro na herança. */
export function ShareBar({ shares }: { shares: HeirShare[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (el: HTMLElement, s: HeirShare, color: string) => {
    const box = wrap.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!box) return;
    setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, share: s, color });
  };

  return (
    <div className="share-bar-wrap" ref={wrap} onPointerLeave={() => setTip(null)}>
      <div className="share-bar" role="list" aria-label="Quotas na herança">
        {shares.map((s, i) => {
          const pct = toNumber(s.fraction) * 100;
          const color = seriesVar(i);
          return (
            <div
              key={s.key}
              role="listitem"
              tabIndex={0}
              className="share-seg"
              style={{ flexGrow: pct, background: color }}
              aria-label={`${s.name}: ${prettyFrac(s.fraction)} (${fmtPct(s.fraction)})`}
              onPointerEnter={(e) => show(e.currentTarget, s, color)}
              onFocus={(e) => show(e.currentTarget, s, color)}
              onBlur={() => setTip(null)}
            >
              {pct >= 11 && <span className="share-seg-label">{prettyFrac(s.fraction)}</span>}
            </div>
          );
        })}
      </div>
      {tip && (
        <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <div className="viz-tip-value">
            {prettyFrac(tip.share.fraction)} · {fmtPct(tip.share.fraction)}
          </div>
          {tip.share.amount !== null && <div className="viz-tip-value sub">{formatEur(tip.share.amount)}</div>}
          <div className="viz-tip-row">
            <i style={{ background: tip.color }} />
            {tip.share.name}
          </div>
        </div>
      )}
    </div>
  );
}

/** Medidor: legítima (indisponível) sobre o total da herança. */
export function LegitimaMeter({ legitima, label }: { legitima: number; label: string }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(legitima * 100)} aria-label={label}>
      <div className="meter-fill" style={{ width: `${legitima * 100}%` }} />
    </div>
  );
}
