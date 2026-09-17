import { useId, useState } from 'react';
import { Table2 } from 'lucide-react';

// Gráficos SVG acessíveis: cada gráfico tem título, descrição, legenda quando há mais de uma
// série, rótulos diretos e uma tabela alternativa que o utilizador pode mostrar em vez do gráfico.

export interface Series {
  name: string;
  values: number[];
  /** Cor CSS (de preferência um token: var(--st-concluido)). */
  color: string;
}

const fmt = (v: number, unit?: string): string => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ` ${unit}` : ''}`;

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

function DataTable({ categories, series, unit, caption }: { categories: string[]; series: Series[]; unit?: string; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="table small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c}>
              <th scope="row">{c}</th>
              {series.map((s) => (
                <td key={s.name}>{fmt(s.values[i] ?? 0, unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({ title, description, children, table }: { title: string; description: string; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="chart">
      <div className="chart-head">
        <figcaption>
          <strong>{title}</strong>
          <span className="small subtle">{description}</span>
        </figcaption>
        <button type="button" className="btn sm ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          <Table2 aria-hidden /> {showTable ? 'Gráfico' : 'Tabela'}
        </button>
      </div>
      {showTable ? table : children}
    </figure>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="chart-legend">
      {series.map((s) => (
        <li key={s.name}>
          <span className="swatch" style={{ background: s.color }} aria-hidden /> {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Barras verticais (agrupadas ou empilhadas) por categoria — ex.: meses. */
export function BarChart({ title, description, categories, series, stacked, unit, height = 220, tickLabels }: { title: string; description: string; categories: string[]; series: Series[]; stacked?: boolean; unit?: string; height?: number; /** Rótulos curtos do eixo (por omissão, as categorias). */ tickLabels?: string[] }) {
  const id = useId();
  const W = 640;
  const H = height;
  const ticksText = tickLabels ?? categories;
  // Muitas categorias com rótulos longos: roda-se o rótulo para não sobrepor.
  const rotate = categories.length > 6 && ticksText.some((t) => t.length > 7);
  const pad = { l: 36, r: 8, t: 12, b: rotate ? 62 : 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const totals = categories.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(...series.map((x) => x.values[i] ?? 0))));
  const max = niceMax(Math.max(0, ...totals));
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const slot = innerW / Math.max(1, categories.length);
  const barW = stacked ? Math.min(28, slot * 0.6) : Math.min(22, (slot * 0.7) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const summary = categories.map((c, i) => `${c}: ${series.map((s) => `${s.name} ${fmt(s.values[i] ?? 0, unit)}`).join(', ')}`).join('; ');
  const empty = totals.every((t) => t === 0);

  return (
    <ChartFrame title={title} description={description} table={<DataTable categories={categories} series={series} unit={unit} caption={title} />}>
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="chart-svg">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{empty ? 'Sem dados no período.' : summary}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {categories.map((c, i) => {
          const x0 = pad.l + i * slot;
          let acc = 0;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * innerH;
                const x = stacked ? x0 + (slot - barW) / 2 : x0 + (slot - barW * series.length - 2 * (series.length - 1)) / 2 + si * (barW + 2);
                const top = stacked ? y(acc + v) : y(v);
                acc += v;
                return (
                  <g key={s.name}>
                    <rect x={x} y={top} width={barW} height={Math.max(0, h)} rx={2} fill={s.color}>
                      <title>{`${c} — ${s.name}: ${fmt(v, unit)}`}</title>
                    </rect>
                    {!stacked && v > 0 && categories.length <= 12 && (
                      <text x={x + barW / 2} y={top - 3} textAnchor="middle" className="value">
                        {fmt(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              {stacked && acc > 0 && categories.length <= 12 && (
                <text x={x0 + slot / 2} y={y(acc) - 3} textAnchor="middle" className="value">
                  {fmt(acc)}
                </text>
              )}
              {rotate ? (
                <text x={x0 + slot / 2} y={H - pad.b + 14} textAnchor="end" className="tick" transform={`rotate(-35 ${x0 + slot / 2} ${H - pad.b + 14})`}>
                  {ticksText[i] ?? c}
                </text>
              ) : (
                <text x={x0 + slot / 2} y={H - 8} textAnchor="middle" className="tick">
                  {ticksText[i] ?? c}
                </text>
              )}
            </g>
          );
        })}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="empty">
            Sem dados no período
          </text>
        )}
      </svg>
    </ChartFrame>
  );
}

/** Barras horizontais de uma série — ex.: dias por fase. */
export function HBarChart({ title, description, categories, values, color = 'var(--primary)', unit, notes }: { title: string; description: string; categories: string[]; values: Array<number | null>; color?: string; unit?: string; notes?: string[] }) {
  const id = useId();
  const W = 640;
  const rowH = 26;
  const pad = { l: 120, r: 60, t: 8, b: 8 };
  const H = pad.t + pad.b + rowH * categories.length;
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const innerW = W - pad.l - pad.r;
  const summary = categories.map((c, i) => `${c}: ${values[i] === null ? 'sem dados' : fmt(values[i]!, unit)}${notes?.[i] ? ` (${notes[i]})` : ''}`).join('; ');
  const series: Series[] = [{ name: unit ? `Valor (${unit})` : 'Valor', values: values.map((v) => v ?? 0), color }];

  return (
    <ChartFrame title={title} description={description} table={<DataTable categories={categories.map((c, i) => (notes?.[i] ? `${c} · ${notes[i]}` : c))} series={series} unit={unit} caption={title} />}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="chart-svg">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{summary}</desc>
        {categories.map((c, i) => {
          const v = values[i] ?? null;
          const yy = pad.t + i * rowH;
          const w = v === null ? 0 : (v / max) * innerW;
          return (
            <g key={c}>
              <text x={pad.l - 8} y={yy + rowH / 2 + 4} textAnchor="end" className="tick">
                {c}
              </text>
              <rect x={pad.l} y={yy + 5} width={innerW} height={rowH - 10} rx={3} className="track" />
              {v !== null && (
                <rect x={pad.l} y={yy + 5} width={Math.max(2, w)} height={rowH - 10} rx={3} fill={color}>
                  <title>{`${c}: ${fmt(v, unit)}${notes?.[i] ? ` (${notes[i]})` : ''}`}</title>
                </rect>
              )}
              <text x={pad.l + Math.max(2, w) + 6} y={yy + rowH / 2 + 4} className="value">
                {v === null ? 'sem dados' : fmt(v, unit)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
