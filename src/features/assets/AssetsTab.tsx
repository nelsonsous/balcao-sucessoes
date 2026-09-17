import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileSpreadsheet, FileText, Globe, Info, Landmark, Plus, Scale, Trash2, Wallet } from 'lucide-react';
import { deleteAsset, deleteDebt, saveAsset, saveDebt } from '../../lib/actions';
import { db, newAsset, newDebt } from '../../lib/db';
import {
  ASSET_STATUS_LABELS,
  DEBT_STATUS_LABELS,
  OWNERSHIP_LABELS,
  VALUE_BASIS_LABELS,
} from '../../lib/labels';
import type { AssetRecord, AssetType, CaseRecord, DebtRecord } from '../../lib/types';
import { cx, formatEur, maskIban } from '../../lib/utils';
import { ASSET_META } from '../../components/icons';
import { MoneyInput } from '../../components/MoneyInput';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty, Field, Sheet, useConfirm } from '../../components/ui';
import { csvName, downloadCsv } from '../../lib/csv';
import { assetsCsvRows } from '../../lib/reports';
import { ReportSheet } from '../reports/ReportSheet';

const TYPES = Object.keys(ASSET_META) as AssetType[];
const isForeign = (a: AssetRecord) => Boolean(a.country) && a.country.trim().toLowerCase() !== 'portugal';

export function estateSummary(c: CaseRecord, assets: AssetRecord[], debts: DebtRecord[]) {
  const communal = c.answers.spouse === 'casado' && (c.answers.regime === 'comunhao_adquiridos' || c.answers.regime === 'comunhao_geral');
  let own = 0;
  let common = 0;
  let unclassified = 0;
  let unvalued = 0;
  for (const a of assets) {
    if (a.value === null) {
      unvalued += 1;
      continue;
    }
    if (a.ownership === 'comum') common += a.value;
    else if (a.ownership === 'proprio') own += a.value;
    else unclassified += a.value;
  }
  const gross = own + common + unclassified;
  const liabilities = debts.filter((d) => d.status !== 'pago').reduce((s, d) => s + (d.amount ?? 0), 0);
  const meacao = communal ? common / 2 : 0;
  const estate = gross - meacao - liabilities;
  return { communal, own, common, unclassified, unvalued, gross, liabilities, meacao, estate };
}

export function AssetsTab({ c }: { c: CaseRecord }) {
  const data = useLiveQuery(async () => {
    const [assets, debts] = await Promise.all([
      db.assets.where('caseId').equals(c.id).sortBy('createdAt'),
      db.debts.where('caseId').equals(c.id).sortBy('createdAt'),
    ]);
    return { assets, debts };
  }, [c.id]);
  const [asset, setAsset] = useState<{ a: AssetRecord; isNew: boolean } | null>(null);
  const [debt, setDebt] = useState<{ d: DebtRecord; isNew: boolean } | null>(null);
  const [report, setReport] = useState(false);

  const assets = data?.assets ?? [];
  const debts = data?.debts ?? [];
  const sum = useMemo(() => estateSummary(c, assets, debts), [c, assets, debts]);

  const byType = TYPES.map((t) => {
    const l = assets.filter((a) => a.type === t);
    return { t, count: l.length, total: l.reduce((s, a) => s + (a.value ?? 0), 0) };
  });
  const foreign = assets.filter(isForeign);

  if (!data) return <div className="skeleton" style={{ height: 200 }} />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="toolbar">
        <div>
          <h2>Património</h2>
          <p className="subtle small">Vários tipos de bens no mesmo dossier — com valores, titularidade e estado.</p>
        </div>
        <span className="spacer" />
        <Button icon={FileText} onClick={() => setReport(true)} disabled={assets.length === 0 && debts.length === 0} title="Relação de bens para imprimir ou Word">
          Relação de bens
        </Button>
        <Button
          icon={FileSpreadsheet}
          disabled={assets.length === 0 && debts.length === 0}
          onClick={() => {
            const { header, rows } = assetsCsvRows(c, assets, debts);
            downloadCsv(csvName(`relacao-bens-${c.ref}`), header, rows);
          }}
        >
          CSV
        </Button>
        <Button icon={Wallet} onClick={() => setDebt({ d: newDebt(c.id), isNew: true })}>
          Dívida
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setAsset({ a: newAsset(c.id), isNew: true })}>
          Adicionar bem
        </Button>
      </div>

      <div className="asset-types">
        {byType.map(({ t, count, total }) => {
          const M = ASSET_META[t];
          return (
            <button
              key={t}
              type="button"
              className={cx('asset-type', count > 0 && 'has')}
              onClick={() => setAsset({ a: newAsset(c.id, { type: t }), isNew: true })}
              title={`Adicionar ${M.label.toLowerCase()}`}
            >
              <M.icon aria-hidden />
              <span className="asset-type-label">{M.plural}</span>
              <span className="asset-type-count tabular">{count}</span>
              <span className="asset-type-total tabular">{count ? formatEur(total, true) : '—'}</span>
            </button>
          );
        })}
        <div className={cx('asset-type', foreign.length > 0 && 'has')}>
          <Globe aria-hidden />
          <span className="asset-type-label">No estrangeiro</span>
          <span className="asset-type-count tabular">{foreign.length}</span>
          <span className="asset-type-total tabular">
            {foreign.length ? formatEur(foreign.reduce((s, a) => s + (a.value ?? 0), 0), true) : '—'}
          </span>
        </div>
      </div>

      <div className="estate-grid">
        <Card>
          <CardHead icon={Landmark} title="Bens" subtitle={`${assets.length} bem(ns) registado(s)`} />
          <div className="card-body" style={{ paddingTop: 10 }}>
            {assets.length === 0 ? (
              <Empty
                icon={Landmark}
                title="Sem bens registados"
                text="Registe imóveis, contas, participações, veículos e bens no estrangeiro."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bem</th>
                      <th>Titularidade</th>
                      <th>Estado</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => {
                      const M = ASSET_META[a.type];
                      return (
                        <tr key={a.id} className="clickable" onClick={() => setAsset({ a, isNew: false })}>
                          <td>
                            <div className="row">
                              <span className="icon-tile" style={{ width: 30, height: 30 }}>
                                <M.icon aria-hidden />
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div className="strong">{a.description || M.label}</div>
                                <div className="tiny subtle">
                                  {M.label}
                                  {isForeign(a) ? ` · ${a.country}` : ''}
                                  {a.bank ? ` · ${a.bank}` : ''}
                                  {a.iban ? ` · ${maskIban(a.iban)}` : ''}
                                  {a.matrixArticle ? ` · Art. ${a.matrixArticle}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={cx('badge', a.ownership === 'desconhecido' && 'warn')}>{OWNERSHIP_LABELS[a.ownership]}</span>
                          </td>
                          <td className="small">{ASSET_STATUS_LABELS[a.status]}</td>
                          <td className="num">
                            <div className="strong">{formatEur(a.value)}</div>
                            {a.valueBasis && <div className="tiny subtle">{VALUE_BASIS_LABELS[a.valueBasis]}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={Scale} title="Estimativa da massa hereditária" subtitle="Valores registados — confirmar para efeitos fiscais" />
          <div className="card-body">
            <dl className="money-list">
              <dt>Bens próprios</dt>
              <dd>{formatEur(sum.own)}</dd>
              <dt>Bens comuns</dt>
              <dd>{formatEur(sum.common)}</dd>
              {sum.unclassified > 0 && (
                <>
                  <dt className="warn-text">Por classificar</dt>
                  <dd>{formatEur(sum.unclassified)}</dd>
                </>
              )}
              <dt className="strong">Ativo bruto</dt>
              <dd className="strong">{formatEur(sum.gross)}</dd>
              {sum.communal && (
                <>
                  <dt>− Meação do cônjuge (½ dos comuns)</dt>
                  <dd>{formatEur(-sum.meacao)}</dd>
                </>
              )}
              <dt>− Passivo</dt>
              <dd>{formatEur(-sum.liabilities)}</dd>
              <dt className="total">Massa hereditária estimada</dt>
              <dd className={cx('total', sum.estate < 0 && 'neg')}>{formatEur(sum.estate)}</dd>
            </dl>
            {sum.estate < 0 && (
              <div className="callout danger" style={{ marginTop: 12 }}>
                <Info aria-hidden />
                <div>O passivo registado supera o ativo. Avaliar aceitação a benefício de inventário ou repúdio.</div>
              </div>
            )}
            {sum.unvalued > 0 && (
              <p className="tiny subtle" style={{ marginTop: 10 }}>
                {sum.unvalued} bem(ns) sem valor atribuído não entram no cálculo.
              </p>
            )}
            {!sum.communal && c.answers.spouse === 'casado' && c.answers.regime !== 'separacao' && (
              <p className="tiny subtle" style={{ marginTop: 10 }}>
                Indique o regime de bens no questionário para calcular a meação.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead
          icon={Wallet}
          title="Passivo"
          subtitle={debts.length ? `${debts.length} dívida(s) · ${formatEur(sum.liabilities)} por liquidar` : 'Sem dívidas registadas'}
          actions={
            <Button size="sm" icon={Plus} onClick={() => setDebt({ d: newDebt(c.id), isNew: true })}>
              Dívida
            </Button>
          }
        />
        <div className="card-body">
          {debts.length === 0 ? (
            <p className="subtle small">Sem passivo registado.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Credor</th>
                    <th>Garantia</th>
                    <th>Estado</th>
                    <th className="num">Montante</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => setDebt({ d, isNew: false })}>
                      <td>
                        <div className="strong">{d.creditor || 'Credor por indicar'}</div>
                        <div className="tiny subtle">{d.description}</div>
                      </td>
                      <td className="small">{d.guarantee || '—'}</td>
                      <td>
                        <span className={cx('badge', d.status === 'pago' ? 'ok' : d.status === 'contestado' ? 'critical' : d.status === 'por_confirmar' ? 'warn' : '')}>
                          {DEBT_STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td className="num strong">{formatEur(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <AssetSheet state={asset} onClose={() => setAsset(null)} />
      <DebtSheet state={debt} onClose={() => setDebt(null)} />
      <ReportSheet c={c} kind={report ? 'bens' : null} onClose={() => setReport(false)} onKind={() => undefined} />
    </div>
  );
}

function AssetSheet({ state, onClose }: { state: { a: AssetRecord; isNew: boolean } | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [a, setA] = useState<AssetRecord | null>(state?.a ?? null);
  useEffect(() => setA(state?.a ?? null), [state]);
  if (!state || !a) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = (p: Partial<AssetRecord>) => setA((x) => (x ? { ...x, ...p } : x));
  const M = ASSET_META[a.type];

  async function save() {
    if (!a) return;
    await saveAsset(a, state!.isNew);
    toast({ tone: 'success', title: state!.isNew ? 'Bem adicionado' : 'Bem atualizado' });
    onClose();
  }
  async function remove() {
    if (!a) return;
    if (!(await confirm({ title: 'Remover este bem?', confirmLabel: 'Remover', danger: true }))) return;
    await deleteAsset(a);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={state.isNew ? `Novo bem — ${M.label}` : a.description || M.label}
      subtitle="Identificação, titularidade e valor"
      icon={M.icon}
      footer={
        <>
          {!state.isNew && (
            <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
              Remover
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-section">
        <div className="form-grid">
          <Field label="Tipo de bem" htmlFor="a-type">
            <select id="a-type" className="select" value={a.type} onChange={(e) => set({ type: e.target.value as AssetType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_META[t].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="País" htmlFor="a-country">
            <input id="a-country" className="input" value={a.country} onChange={(e) => set({ country: e.target.value })} />
          </Field>
          <Field label="Descrição" htmlFor="a-desc" className="span-2">
            <input id="a-desc" className="input" data-autofocus value={a.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Titular / entidade" htmlFor="a-holder">
            <input id="a-holder" className="input" value={a.holder} onChange={(e) => set({ holder: e.target.value })} />
          </Field>
          <Field label="Estado" htmlFor="a-status">
            <select id="a-status" className="select" value={a.status} onChange={(e) => set({ status: e.target.value as AssetRecord['status'] })}>
              {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {a.type === 'imoveis' && (
        <div className="form-section">
          <h3>Dados prediais</h3>
          <div className="form-grid">
            <Field label="Artigo matricial" htmlFor="a-art">
              <input id="a-art" className="input" value={a.matrixArticle} onChange={(e) => set({ matrixArticle: e.target.value })} />
            </Field>
            <Field label="Freguesia" htmlFor="a-parish">
              <input id="a-parish" className="input" value={a.parish} onChange={(e) => set({ parish: e.target.value })} />
            </Field>
            <Field label="Descrição predial n.º" htmlFor="a-reg" className="span-2">
              <input id="a-reg" className="input" value={a.registryNumber} onChange={(e) => set({ registryNumber: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
      {(a.type === 'contas' || a.type === 'aforro') && (
        <div className="form-section">
          <h3>Dados bancários</h3>
          <div className="form-grid">
            <Field label="Instituição" htmlFor="a-bank">
              <input id="a-bank" className="input" value={a.bank} onChange={(e) => set({ bank: e.target.value })} />
            </Field>
            <Field label="IBAN / n.º de conta" htmlFor="a-iban" hint="Mostrado mascarado nas listas.">
              <input id="a-iban" className="input" value={a.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} />
            </Field>
          </div>
        </div>
      )}
      {a.type === 'participacoes' && (
        <div className="form-section">
          <h3>Sociedade</h3>
          <div className="form-grid">
            <Field label="Sociedade" htmlFor="a-co">
              <input id="a-co" className="input" value={a.company} onChange={(e) => set({ company: e.target.value })} />
            </Field>
            <Field label="NIPC" htmlFor="a-nipc">
              <input id="a-nipc" className="input" inputMode="numeric" value={a.nipc} onChange={(e) => set({ nipc: e.target.value })} />
            </Field>
            <Field label="% do capital" htmlFor="a-pct">
              <input id="a-pct" className="input" inputMode="decimal" value={a.capitalPct} onChange={(e) => set({ capitalPct: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
      {a.type === 'veiculos' && (
        <div className="form-section">
          <h3>Veículo</h3>
          <div className="form-grid">
            <Field label="Matrícula" htmlFor="a-plate">
              <input id="a-plate" className="input" value={a.plate} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} />
            </Field>
          </div>
        </div>
      )}

      <div className="form-section">
        <h3>Titularidade e valor</h3>
        <div className="form-grid">
          <Field label="Natureza" htmlFor="a-own" hint="Nos regimes de comunhão, só metade dos bens comuns integra a herança.">
            <select id="a-own" className="select" value={a.ownership} onChange={(e) => set({ ownership: e.target.value as AssetRecord['ownership'] })}>
              {Object.entries(OWNERSHIP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quota-parte do de cujus" htmlFor="a-share" hint="Ex.: 1/1, 1/2 (compropriedade)">
            <input id="a-share" className="input" value={a.share} placeholder="1/1" onChange={(e) => set({ share: e.target.value })} />
          </Field>
          <Field label="Valor" htmlFor="a-value">
            <MoneyInput id="a-value" value={a.value} onChange={(value) => set({ value })} />
          </Field>
          <Field label="Base do valor" htmlFor="a-basis">
            <select id="a-basis" className="select" value={a.valueBasis} onChange={(e) => set({ valueBasis: e.target.value as AssetRecord['valueBasis'] })}>
              {Object.entries(VALUE_BASIS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {k ? v : 'Por indicar'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observações" htmlFor="a-notes" className="span-2">
            <textarea id="a-notes" className="textarea" value={a.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function DebtSheet({ state, onClose }: { state: { d: DebtRecord; isNew: boolean } | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<DebtRecord | null>(state?.d ?? null);
  useEffect(() => setD(state?.d ?? null), [state]);
  if (!state || !d) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = (p: Partial<DebtRecord>) => setD((x) => (x ? { ...x, ...p } : x));

  async function save() {
    if (!d) return;
    await saveDebt(d, state!.isNew);
    toast({ tone: 'success', title: state!.isNew ? 'Dívida adicionada' : 'Dívida atualizada' });
    onClose();
  }
  async function remove() {
    if (!d) return;
    if (!(await confirm({ title: 'Remover esta dívida?', confirmLabel: 'Remover', danger: true }))) return;
    await deleteDebt(d);
    onClose();
  }

  return (
    <Sheet
      open
      variant="modal"
      onClose={onClose}
      title={state.isNew ? 'Nova dívida' : d.creditor || 'Dívida'}
      icon={Wallet}
      footer={
        <>
          {!state.isNew && (
            <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
              Remover
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Credor" htmlFor="d-cred" className="span-2">
          <input id="d-cred" className="input" data-autofocus value={d.creditor} onChange={(e) => set({ creditor: e.target.value })} />
        </Field>
        <Field label="Descrição" htmlFor="d-desc" className="span-2">
          <input id="d-desc" className="input" value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Montante à data do óbito" htmlFor="d-amount">
          <MoneyInput id="d-amount" value={d.amount} onChange={(amount) => set({ amount })} />
        </Field>
        <Field label="Estado" htmlFor="d-status">
          <select id="d-status" className="select" value={d.status} onChange={(e) => set({ status: e.target.value as DebtRecord['status'] })}>
            {Object.entries(DEBT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Garantia" htmlFor="d-guar" className="span-2" hint="Ex.: hipoteca, fiança, penhor">
          <input id="d-guar" className="input" value={d.guarantee} onChange={(e) => set({ guarantee: e.target.value })} />
        </Field>
        <Field label="Observações" htmlFor="d-notes" className="span-2">
          <textarea id="d-notes" className="textarea" value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
