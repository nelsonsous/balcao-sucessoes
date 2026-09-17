import { useMemo, type ReactNode } from 'react';
import { GitBranch, Info, Landmark, Plus, Scale, TriangleAlert, Users, X } from 'lucide-react';
import {
  STATUS_LABELS,
  calculate,
  newPerson,
  type CalcInput,
  type CalcPerson,
  type CalcValues,
  type HeirStatus,
  type Regime,
} from '../../engine/succession';
import { fmtPct, prettyFrac, toNumber } from '../../engine/fraction';
import { cx, formatEur } from '../../lib/utils';
import { MoneyInput } from '../../components/MoneyInput';
import { Button, Card, CardHead, Field, Segmented } from '../../components/ui';
import { FamilyTree } from './FamilyTree';
import { LegitimaMeter, SERIES_COUNT, ShareBar, seriesVar } from './ShareBar';

type Variant = 'filho' | 'irmao' | 'colateral';

const ADD_LABEL: Record<Variant, string[]> = {
  filho: ['Adicionar filho(a)', 'Adicionar neto(a)', 'Adicionar bisneto(a)'],
  irmao: ['Adicionar irmão(ã)', 'Adicionar sobrinho(a)', 'Adicionar sobrinho(a)-neto(a)'],
  colateral: ['Adicionar colateral'],
};

const PLACEHOLDER: Record<Variant, string[]> = {
  filho: ['Nome do filho(a)', 'Nome do neto(a)', 'Nome do bisneto(a)'],
  irmao: ['Nome do irmão(ã)', 'Nome do sobrinho(a)', 'Nome do sobrinho(a)-neto(a)'],
  colateral: ['Nome (tio, primo direito, tio-avô…)'],
};

function PeopleEditor({
  list,
  onChange,
  variant,
  depth = 0,
}: {
  list: CalcPerson[];
  onChange: (l: CalcPerson[]) => void;
  variant: Variant;
  depth?: number;
}) {
  const update = (id: string, patch: Partial<CalcPerson>) => onChange(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => onChange(list.filter((p) => p.id !== id));
  const add = () =>
    onChange([
      ...list,
      newPerson(variant === 'irmao' && depth === 0 ? { kind: 'germano' } : variant === 'colateral' ? { degree: 4 } : {}),
    ]);

  return (
    <div className={cx('pe-list', depth > 0 && 'nested')}>
      {list.map((p, i) => (
        <div key={p.id} className="pe-item">
          <div className="pe-row">
            <input
              className="input"
              value={p.name}
              placeholder={PLACEHOLDER[variant][depth] ?? 'Nome'}
              aria-label={`${PLACEHOLDER[variant][depth] ?? 'Nome'} ${i + 1}`}
              onChange={(e) => update(p.id, { name: e.target.value })}
            />
            {variant === 'irmao' && depth === 0 && (
              <select
                className="select"
                aria-label="Tipo de irmão"
                value={p.kind ?? 'germano'}
                onChange={(e) => update(p.id, { kind: e.target.value as CalcPerson['kind'] })}
              >
                <option value="germano">Germano</option>
                <option value="unilateral">Unilateral</option>
              </select>
            )}
            {variant === 'colateral' ? (
              <select
                className="select"
                aria-label="Grau de parentesco"
                value={p.degree ?? 4}
                onChange={(e) => update(p.id, { degree: Number(e.target.value) as 3 | 4 })}
              >
                <option value={3}>3.º grau</option>
                <option value={4}>4.º grau</option>
              </select>
            ) : (
              <select
                className="select"
                aria-label="Situação"
                value={p.status}
                onChange={(e) => update(p.id, { status: e.target.value as HeirStatus })}
              >
                {(Object.keys(STATUS_LABELS) as HeirStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
            <Button variant="ghost" size="sm" iconOnly icon={X} aria-label="Remover" onClick={() => remove(p.id)} />
          </div>
          {variant !== 'colateral' && p.status !== 'vivo' && depth < 2 && (
            <div className="pe-sub">
              <span className="tiny subtle">
                {p.status === 'predefunto' ? 'Descendentes que o(a) representam' : 'Descendentes chamados por representação'}
              </span>
              <PeopleEditor list={p.descendants} onChange={(d) => update(p.id, { descendants: d })} variant={variant} depth={depth + 1} />
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant={depth ? 'ghost' : 'soft'} icon={Plus} onClick={add}>
        {ADD_LABEL[variant][depth] ?? 'Adicionar'}
      </Button>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Users; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="calc-section">
      <div className="calc-section-head">
        <Icon aria-hidden />
        <div>
          <h3>{title}</h3>
          {hint && <p className="tiny subtle">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SuccessionCalculator({ value, onChange, headerExtra }: { value: CalcInput; onChange: (v: CalcInput) => void; headerExtra?: ReactNode }) {
  const result = useMemo(() => calculate(value), [value]);
  const set = (patch: Partial<CalcInput>) => onChange({ ...value, ...patch });
  const setValues = (patch: Partial<CalcValues>) => onChange({ ...value, values: { ...value.values, ...patch } });
  const hasDescendants = value.children.length > 0;
  const communal = value.spouse.present && value.spouse.regime !== 'separacao';

  // Mais de 8 herdeiros: os restantes juntam-se em "Outros" na barra (a tabela mostra todos).
  const barShares = useMemo(() => {
    if (result.shares.length <= SERIES_COUNT) return result.shares;
    const head = result.shares.slice(0, SERIES_COUNT - 1);
    const rest = result.shares.slice(SERIES_COUNT - 1);
    const n = rest.reduce((acc, s) => acc + toNumber(s.fraction), 0);
    const approx = { n: Math.round(n * 10000), d: 10000 };
    return [
      ...head,
      { ...rest[0]!, key: 'outros', name: `Outros (${rest.length})`, fraction: approx, amount: rest.every((s) => s.amount !== null) ? rest.reduce((a, s) => a + (s.amount ?? 0), 0) : null },
    ];
  }, [result.shares]);

  return (
    <div className="calc-host">
    <div className="calc-layout">
      <div className="calc-editor stack" style={{ gap: 14 }}>
        <Card pad>
          <Section icon={Users} title="De cujus e cônjuge" hint="O cônjuge divorciado ou separado judicialmente de pessoas e bens não é chamado (art. 2133.º, n.º 3 CC).">
            <Field label="Nome do falecido" htmlFor="c-dec">
              <input id="c-dec" className="input" value={value.deceasedName} onChange={(e) => set({ deceasedName: e.target.value })} />
            </Field>
            <Segmented<'sim' | 'nao'>
              label="Cônjuge sobrevivo"
              value={value.spouse.present ? 'sim' : 'nao'}
              onChange={(v) => set({ spouse: { ...value.spouse, present: v === 'sim' } })}
              options={[
                { value: 'nao', label: 'Sem cônjuge' },
                { value: 'sim', label: 'Com cônjuge sobrevivo' },
              ]}
            />
            {value.spouse.present && (
              <div className="form-grid">
                <Field label="Nome do cônjuge" htmlFor="c-sp">
                  <input id="c-sp" className="input" value={value.spouse.name} onChange={(e) => set({ spouse: { ...value.spouse, name: e.target.value } })} />
                </Field>
                <Field label="Regime de bens" htmlFor="c-reg">
                  <select
                    id="c-reg"
                    className="select"
                    value={value.spouse.regime}
                    onChange={(e) => set({ spouse: { ...value.spouse, regime: e.target.value as Regime } })}
                  >
                    <option value="comunhao_adquiridos">Comunhão de adquiridos</option>
                    <option value="comunhao_geral">Comunhão geral</option>
                    <option value="separacao">Separação de bens</option>
                  </select>
                </Field>
              </div>
            )}
            <p className="tiny subtle">O unido de facto não é herdeiro legal; pode receber por testamento (Lei n.º 7/2001).</p>
          </Section>
        </Card>

        <Card pad>
          <Section icon={GitBranch} title="Descendentes" hint="Filhos e, por representação, os descendentes de quem não pode ou não quer aceitar.">
            <PeopleEditor list={value.children} onChange={(children) => set({ children })} variant="filho" />
          </Section>
        </Card>

        <Card pad>
          <Section
            icon={Users}
            title="Ascendentes"
            hint={hasDescendants ? 'Havendo descendentes, os ascendentes não são chamados.' : 'O grau mais próximo afasta o mais afastado.'}
          >
            <div className="form-grid">
              <Field label="Pais vivos" htmlFor="c-par">
                <select id="c-par" className="select" value={value.parents} onChange={(e) => set({ parents: Number(e.target.value) })}>
                  {[0, 1, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Avós vivos" htmlFor="c-gp">
                <select id="c-gp" className="select" value={value.grandparents} onChange={(e) => set({ grandparents: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>
        </Card>

        <Card pad>
          <Section icon={Users} title="Irmãos e sobrinhos" hint="Chamados só na falta de cônjuge, descendentes e ascendentes. Germano: mesmo pai e mãe.">
            <PeopleEditor list={value.siblings} onChange={(siblings) => set({ siblings })} variant="irmao" />
          </Section>
        </Card>

        <Card pad>
          <Section icon={Users} title="Outros colaterais" hint="Até ao 4.º grau: tios (3.º); primos direitos e tios-avós (4.º).">
            <PeopleEditor list={value.collaterals} onChange={(collaterals) => set({ collaterals })} variant="colateral" />
          </Section>
        </Card>

        <Card pad>
          <Section icon={Landmark} title="Valores (opcional)" hint="Para calcular quinhões, legítima e quota disponível em euros.">
            <div className="form-grid">
              <Field label="Bens próprios do falecido" htmlFor="v-own">
                <MoneyInput id="v-own" value={value.values.own} onChange={(own) => setValues({ own })} />
              </Field>
              {communal && (
                <Field label="Bens comuns do casal (total)" htmlFor="v-common" hint="Metade é a meação do cônjuge.">
                  <MoneyInput id="v-common" value={value.values.common} onChange={(common) => setValues({ common })} />
                </Field>
              )}
              <Field label="Passivo da herança" htmlFor="v-debts">
                <MoneyInput id="v-debts" value={value.values.debts} onChange={(debts) => setValues({ debts })} />
              </Field>
              <Field label="Doações em vida (colação)" htmlFor="v-don" hint="Somam ao valor para cálculo da legítima.">
                <MoneyInput id="v-don" value={value.values.donations} onChange={(donations) => setValues({ donations })} />
              </Field>
              <Field label="Disposições a favor de terceiros" htmlFor="v-test" hint="Legados/testamento: verifica a inoficiosidade.">
                <MoneyInput id="v-test" value={value.values.testamentary} onChange={(testamentary) => setValues({ testamentary })} />
              </Field>
            </div>
          </Section>
        </Card>
      </div>

      <div className="calc-result stack" style={{ gap: 14 }}>
        <Card>
          <CardHead
            icon={Scale}
            title="Quotas hereditárias"
            subtitle={result.klassLabel}
            actions={headerExtra}
          />
          <div className="card-body viz-root">
            <ShareBar shares={barShares} />
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table share-table">
                <thead>
                  <tr>
                    <th>Herdeiro</th>
                    <th className="num">Quota</th>
                    <th className="num">%</th>
                    {result.hasValues && <th className="num">Valor</th>}
                    <th className="num" title="Parte na legítima (quota indisponível)">Legítima</th>
                  </tr>
                </thead>
                <tbody>
                  {result.shares.map((s, i) => (
                    <tr key={s.key}>
                      <td>
                        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                          <i className="legend-key" style={{ background: seriesVar(Math.min(i, SERIES_COUNT - 1)) }} aria-hidden />
                          <div style={{ minWidth: 0 }}>
                            <div className="strong">{s.name}</div>
                            <div className="tiny subtle">
                              {s.relation}
                              {s.via.length > 0 && ` · em representação de ${s.via.join(' › ')}`}
                            </div>
                            {s.taxed && s.stampDuty !== null && (
                              <div className="tiny warn-text">Imposto do Selo (10%): {formatEur(s.stampDuty)}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="num strong" style={{ fontSize: 15 }}>
                        {prettyFrac(s.fraction)}
                      </td>
                      <td className="num">{fmtPct(s.fraction)}</td>
                      {result.hasValues && <td className="num">{formatEur(s.amount)}</td>}
                      <td className="num subtle">
                        {s.legitimario ? (
                          <>
                            {prettyFrac(s.legitima)}
                            {s.legitimaAmount !== null && <div className="tiny">{formatEur(s.legitimaAmount)}</div>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <div className="calc-kpis">
          <Card pad className="viz-root">
            <div className="section-title">Legítima (indisponível)</div>
            <div className="calc-big">{prettyFrac(result.legitimaFraction)}</div>
            <LegitimaMeter legitima={toNumber(result.legitimaFraction)} label="Legítima em percentagem da herança" />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span className="small">
                <i className="legend-key" style={{ background: 'var(--meter-fill)' }} aria-hidden /> Legítima {fmtPct(result.legitimaFraction)}
              </span>
              <span className="small subtle">Disponível {fmtPct(result.availableFraction)}</span>
            </div>
            {result.hasValues && (
              <div className="small" style={{ marginTop: 8 }}>
                <strong>{formatEur(result.values.legitima)}</strong> legítima · <strong>{formatEur(result.values.available)}</strong> disponível
              </div>
            )}
          </Card>
          <Card pad>
            <div className="section-title">Quota disponível</div>
            <div className="calc-big">{prettyFrac(result.availableFraction)}</div>
            <p className="small subtle">
              {toNumber(result.legitimaFraction) === 0
                ? 'Sem herdeiros legitimários: o autor da sucessão pode dispor de toda a herança.'
                : 'Parte de que o autor da sucessão pode dispor livremente por testamento ou doação.'}
            </p>
            {result.values.excess > 0 && (
              <div className="callout danger" style={{ marginTop: 10 }}>
                <TriangleAlert aria-hidden />
                <div>
                  Disposições excedem a quota disponível em <strong>{formatEur(result.values.excess)}</strong> — redutíveis por inoficiosidade.
                </div>
              </div>
            )}
          </Card>
        </div>

        {result.hasValues && (
          <Card>
            <CardHead icon={Landmark} title="Massa da herança" subtitle="Valores introduzidos — indicativos" />
            <div className="card-body">
              <dl className="money-list">
                {result.values.meacao > 0 && (
                  <>
                    <dt>Meação do cônjuge (fora da herança)</dt>
                    <dd>{formatEur(result.values.meacao)}</dd>
                  </>
                )}
                <dt>Relicto (bens do falecido)</dt>
                <dd>{formatEur(result.values.relictum)}</dd>
                <dt>− Passivo</dt>
                <dd>{formatEur(-(value.values.debts ?? 0))}</dd>
                <dt className="strong">Herança líquida a partilhar</dt>
                <dd className="strong">{formatEur(result.values.net)}</dd>
                <dt>+ Doações sujeitas a colação</dt>
                <dd>{formatEur(value.values.donations ?? 0)}</dd>
                <dt className="total">Valor para cálculo da legítima</dt>
                <dd className={cx('total', result.values.base < 0 && 'neg')}>{formatEur(result.values.base)}</dd>
                {result.values.stampDuty > 0 && (
                  <>
                    <dt className="warn-text">Imposto do Selo estimado (10%)</dt>
                    <dd className="warn-text">{formatEur(result.values.stampDuty)}</dd>
                  </>
                )}
              </dl>
              <p className="tiny subtle" style={{ marginTop: 10 }}>
                Os valores por herdeiro não incluem a imputação/colação das doações nem a avaliação fiscal (ex.: VPT dos imóveis).
              </p>
            </div>
          </Card>
        )}

        <Card>
          <CardHead icon={Info} title="Fundamentação" subtitle="Como se chegou ao resultado" />
          <div className="card-body">
            <ol className="calc-steps">
              {result.steps.map((s, i) => (
                <li key={i}>
                  <span>{s.text}</span>
                  {s.legal && <span className="legal-chip">{s.legal}</span>}
                </li>
              ))}
            </ol>
            {result.warnings.map((w) => (
              <div key={w} className="callout warn" style={{ marginTop: 10 }}>
                <TriangleAlert aria-hidden />
                <div>{w}</div>
              </div>
            ))}
            <p className="tiny subtle" style={{ marginTop: 12 }}>
              Cálculo de apoio segundo o Código Civil português. Não substitui a análise jurídica do caso (testamento, colação, deserdação, renúncias, lei estrangeira aplicável…).
            </p>
          </div>
        </Card>

        <Card>
          <CardHead icon={GitBranch} title="Árvore genealógica" subtitle="Quem é chamado e com que quota" />
          <div className="card-body">
            <FamilyTree input={value} result={result} />
          </div>
        </Card>
      </div>
    </div>
    </div>
  );
}
