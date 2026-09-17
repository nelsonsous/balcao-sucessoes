import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Scale } from 'lucide-react';
import { calculate, type CalcInput, type CalcResult } from '../../engine/succession';
import { updateCase } from '../../lib/actions';
import { db } from '../../lib/db';
import { SALE_KEY, estateTotals, estateValue, partilhaSummary, readPartilha, verbas, writePartilha, type PartilhaState } from '../../lib/reports';
import type { CaseRecord } from '../../lib/types';
import { cx, formatEur } from '../../lib/utils';
import { Button, Card, CardHead, useDebounced } from '../../components/ui';
import { ReportSheet } from './ReportSheet';

/** Mapa de partilha: atribuir cada bem a um herdeiro e ver as tornas. */
export function PartilhaCard({ c, input }: { c: CaseRecord; input: CalcInput }) {
  const data = useLiveQuery(async () => {
    const [assets, debts] = await Promise.all([db.assets.where('caseId').equals(c.id).sortBy('createdAt'), db.debts.where('caseId').equals(c.id).toArray()]);
    return { assets, debts };
  }, [c.id]);
  const [st, setSt] = useState<PartilhaState>(() => readPartilha(c));
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(st, 700);

  useEffect(() => {
    if (c.partilhaJson === writePartilha(debounced)) return;
    if (!c.partilhaJson && !Object.keys(debounced.assignments).length && !debounced.notes) return;
    void updateCase(c.id, { partilhaJson: writePartilha(debounced) });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc: CalcResult | null = useMemo(() => {
    try {
      return calculate(input);
    } catch {
      return null;
    }
  }, [input]);

  const assets = data?.assets ?? [];
  const debts = data?.debts ?? [];
  const sum = useMemo(() => partilhaSummary(calc, c, assets, debts, st), [calc, c, assets, debts, st]);
  const tot = useMemo(() => estateTotals(c, assets, debts), [c, assets, debts]);
  const vs = useMemo(() => verbas(assets), [assets]);
  const heirs = calc?.shares ?? [];

  const assign = (assetId: string, key: string) =>
    setSt((s) => {
      const assignments = { ...s.assignments };
      if (key) assignments[assetId] = key;
      else delete assignments[assetId];
      return { ...s, assignments };
    });

  return (
    <Card className="no-print">
      <CardHead
        icon={Scale}
        title="Mapa de partilha"
        subtitle="Atribua cada bem a um herdeiro; as tornas são calculadas a partir das quotas."
        actions={
          <Button size="sm" icon={FileText} onClick={() => setOpen(true)}>
            Abrir mapa
          </Button>
        }
      />
      <div className="card-body stack" style={{ gap: 14, paddingTop: 8 }}>
        {!heirs.length ? (
          <p className="small subtle">Sem herdeiros no cálculo — preencha a simulação acima para atribuir bens.</p>
        ) : !vs.length ? (
          <p className="small subtle">Sem bens registados no separador Património.</p>
        ) : (
          <div className="table-wrap">
            <table className="table partilha-table">
              <thead>
                <tr>
                  <th className="num">Verba</th>
                  <th>Bem</th>
                  <th className="num">Valor na herança</th>
                  <th>Atribuído a</th>
                </tr>
              </thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.asset.id}>
                    <td className="num tabular">{v.n}</td>
                    <td>
                      <div className="strong">{v.title}</div>
                      {v.details && <div className="tiny subtle">{v.details}</div>}
                    </td>
                    <td className="num tabular">{formatEur(estateValue(v.asset, tot.communal))}</td>
                    <td>
                      <select className="select" aria-label={`Atribuir ${v.title}`} value={st.assignments[v.asset.id] ?? ''} onChange={(e) => assign(v.asset.id, e.target.value)}>
                        <option value="">Por atribuir</option>
                        {heirs.map((h) => (
                          <option key={h.key} value={h.key}>
                            {h.name} — {h.relation}
                          </option>
                        ))}
                        <option value={SALE_KEY}>Venda / partilha em dinheiro</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {heirs.length > 0 && (
          <div className="table-wrap">
            <table className="table partilha-table">
              <thead>
                <tr>
                  <th>Herdeiro</th>
                  <th className="num">Quota</th>
                  <th className="num">Direito</th>
                  <th className="num">Recebe em bens</th>
                  <th>Tornas</th>
                </tr>
              </thead>
              <tbody>
                {sum.heirs.map((h) => (
                  <tr key={h.key}>
                    <td>
                      <div className="strong">{h.name}</div>
                      <div className="tiny subtle">{h.relation}</div>
                    </td>
                    <td className="num tabular">{h.fraction}</td>
                    <td className="num tabular">{formatEur(h.due)}</td>
                    <td className="num tabular">{formatEur(h.received)}</td>
                    <td className={cx('tabular', h.diff !== null && Math.abs(h.diff) >= 0.005 && (h.diff > 0 ? 'text-danger' : 'text-ok'))}>
                      {h.diff === null ? '—' : Math.abs(h.diff) < 0.005 ? 'Sem tornas' : h.diff > 0 ? `Paga ${formatEur(h.diff)}` : `Recebe ${formatEur(-h.diff)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {sum.heirs.some((h) => (h.imoveisExcess ?? 0) > 0.005) && (
                  <tr>
                    <td colSpan={5}>
                      <span className="tiny text-danger">
                        Excesso em imóveis sobre a quota — sujeito a IMT (CIMT, art. 2.º, n.º 5, al. c)) e Imposto do Selo (verba 1.1 TGIS):{' '}
                        {sum.heirs
                          .filter((h) => (h.imoveisExcess ?? 0) > 0.005)
                          .map((h) => `${h.name} ${formatEur(h.imoveisExcess)}`)
                          .join(' · ')}
                      </span>
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2}>
                    <span className="tiny subtle">
                      Valor da herança: <strong>{formatEur(sum.estate)}</strong> ({sum.source === 'calculo' ? 'valores da simulação' : 'valores do património'})
                    </span>
                  </td>
                  <td colSpan={3}>
                    <span className="tiny subtle">
                      {sum.unassigned.length ? `${sum.unassigned.length} por atribuir · ` : ''}
                      {sum.sale.length ? `${sum.sale.length} para venda (${formatEur(sum.saleValue)})` : 'Nada para venda'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <label className="field">
          <span className="field-label">Notas da partilha</span>
          <textarea className="textarea" rows={2} value={st.notes} placeholder="Acordos, condições, direitos de habitação, encargos assumidos…" onChange={(e) => setSt((s) => ({ ...s, notes: e.target.value }))} />
        </label>
      </div>
      <ReportSheet c={c} kind={open ? 'partilha' : null} onClose={() => setOpen(false)} onKind={() => undefined} />
    </Card>
  );
}
