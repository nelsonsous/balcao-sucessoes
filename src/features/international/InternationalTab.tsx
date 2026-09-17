import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, Building2, CalendarClock, FileCheck, Globe, Plus, Scale, Trash2, TriangleAlert } from 'lucide-react';
import {
  CSE_PURPOSES,
  CSE_STATUS,
  COUNTRY_INFO,
  ENTITY_KIND_LABELS,
  INTL_DOCUMENTS,
  applicableLaw,
  countryDeadlines,
  documentRegime,
  isBound650,
  type EntityKind,
  type IntlEntity,
  type IntlState,
} from '../../engine/international';
import { COUNTRIES } from '../../engine/questions';
import { updateCase } from '../../lib/actions';
import { db } from '../../lib/db';
import { hasForeignLinks, intlSuggestions, readIntl, writeIntl } from '../../lib/intl';
import type { CaseRecord } from '../../lib/types';
import { cx, formatDate, uid } from '../../lib/utils';
import { Button, Card, CardHead, Empty, Field, Sheet, useDebounced } from '../../components/ui';

const ALL_COUNTRIES = ['Portugal', ...COUNTRIES.filter((c) => c !== 'Outro'), 'Itália', 'Irlanda', 'Dinamarca', 'Outro'];

/** Separador «Internacional»: lei aplicável, CSE, documentos, prazos noutros países e entidades. */
export function InternationalTab({ c }: { c: CaseRecord }) {
  const assets = useLiveQuery(() => db.assets.where('caseId').equals(c.id).toArray(), [c.id]) ?? [];
  const [st, setSt] = useState<IntlState>(() => readIntl(c));
  const [entity, setEntity] = useState<IntlEntity | null>(null);
  const debounced = useDebounced(st, 700);
  const sug = useMemo(() => intlSuggestions(c, assets), [c, assets]);

  useEffect(() => {
    if (c.intlJson === writeIntl(debounced)) return;
    if (!c.intlJson && writeIntl(debounced) === writeIntl(readIntl(c))) return;
    void updateCase(c.id, { intlJson: writeIntl(debounced) });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const residence = st.residence || sug.residence;
  const nationalities = st.nationalities.length ? st.nationalities : sug.nationalities;
  const countries = useMemo(() => [...new Set([...sug.countries, residence, ...nationalities, ...st.entities.map((e) => e.country)].filter((x) => x && x !== 'Portugal' && x !== 'Outro'))], [sug.countries, residence, nationalities, st.entities]);
  const law = useMemo(() => applicableLaw({ residence, nationalities, choiceOfLaw: st.choiceOfLaw, closerConnection: st.closerConnection, assetCountries: [...new Set(['Portugal', ...sug.countries])] }), [residence, nationalities, st.choiceOfLaw, st.closerConnection, sug.countries]);
  const deadlines = useMemo(() => countryDeadlines([...countries, 'Portugal'], c.deceased.deathDate, sug.deathCountry), [countries, c.deceased.deathDate, sug.deathCountry]);
  const foreign = hasForeignLinks(c, assets, st);

  const patch = (p: Partial<IntlState>) => setSt((s) => ({ ...s, ...p }));
  const patchCse = (p: Partial<IntlState['cse']>) => setSt((s) => ({ ...s, cse: { ...s.cse, ...p } }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  if (!foreign && !st.residence) {
    return (
      <Card>
        <Empty
          icon={Globe}
          title="Sem elementos internacionais detetados"
          text="Quando o óbito, a residência, a nacionalidade ou os bens tiverem ligação a outro país, este separador ajuda a determinar a lei aplicável, o Certificado Sucessório Europeu, a circulação de documentos e os prazos locais."
          action={
            <Button size="sm" onClick={() => patch({ residence: 'Portugal' })}>
              Analisar mesmo assim
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="toolbar">
        <div>
          <h2>Internacional</h2>
          <p className="subtle small">
            Ligações: {countries.length ? countries.join(', ') : 'nenhuma fora de Portugal'}
            {sug.deathCountry && sug.deathCountry !== 'Portugal' ? ` · óbito em ${sug.deathCountry}` : ''}
          </p>
        </div>
      </div>

      <div className="estate-grid">
        <Card>
          <CardHead icon={Scale} title="Lei aplicável e competência" subtitle="Regulamento (UE) n.º 650/2012 — ponto de partida, a validar." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <div className="form-grid">
              <Field label="Residência habitual à data do óbito" htmlFor="intl-res">
                <select id="intl-res" className="select" value={residence} onChange={(e) => patch({ residence: e.target.value })}>
                  <option value="">— indicar —</option>
                  {ALL_COUNTRIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lei escolhida em testamento (art. 22.º)" htmlFor="intl-choice" hint="Só é válida a escolha da lei de uma nacionalidade.">
                <select id="intl-choice" className="select" value={st.choiceOfLaw} onChange={(e) => patch({ choiceOfLaw: e.target.value })}>
                  <option value="">Sem escolha de lei</option>
                  {ALL_COUNTRIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nacionalidades" htmlFor="intl-nat" className="span-2" hint="Clique para marcar/desmarcar.">
                <div className="row wrap" style={{ gap: 6 }} id="intl-nat">
                  {ALL_COUNTRIES.filter((x) => x !== 'Outro').map((x) => (
                    <button key={x} type="button" className={cx('chip', nationalities.includes(x) && 'on')} aria-pressed={nationalities.includes(x)} onClick={() => patch({ nationalities: toggle(nationalities, x) })}>
                      {x}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Ligação manifestamente mais estreita (art. 21.º, n.º 2)" htmlFor="intl-closer" className="span-2" hint="Exceção rara: só quando resulta claramente do conjunto das circunstâncias.">
                <select id="intl-closer" className="select" value={st.closerConnection} onChange={(e) => patch({ closerConnection: e.target.value })}>
                  <option value="">Não invocada</option>
                  {ALL_COUNTRIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="law-result">
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="badge brand">Lei aplicável: {law.law || '—'}</span>
                {law.jurisdiction && <span className="badge">Competência: {law.jurisdiction}</span>}
                <span className={cx('badge', law.cse.available ? 'ok' : 'warn')}>
                  <BadgeCheck aria-hidden /> CSE {law.cse.available ? 'disponível' : 'não disponível'}
                </span>
              </div>
              <ol className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                {law.steps.map((s, i) => (
                  <li key={i}>
                    {s.text} {s.legal && <span className="subtle">({s.legal})</span>}
                  </li>
                ))}
              </ol>
              {law.jurisdictionBasis && <p className="small subtle" style={{ marginTop: 8 }}>{law.jurisdictionBasis}</p>}
              <p className="small subtle">{law.cse.reason}</p>
              {law.warnings.map((w) => (
                <div key={w} className="callout warn" style={{ marginTop: 8 }}>
                  <TriangleAlert aria-hidden />
                  <div>{w}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead icon={FileCheck} title="Certificado Sucessório Europeu" subtitle="Arts. 62.º a 73.º — prova a qualidade de herdeiro e os poderes de administração em toda a UE (exceto DK e IE)." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <div className="form-grid">
              <Field label="Estado" htmlFor="cse-status">
                <select id="cse-status" className="select" value={st.cse.status} onChange={(e) => patchCse({ status: e.target.value as IntlState['cse']['status'] })}>
                  {CSE_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Onde vai ser usado" htmlFor="cse-states">
                <div className="row wrap" style={{ gap: 6 }} id="cse-states">
                  {ALL_COUNTRIES.filter((x) => isBound650(x) && x !== 'Portugal').map((x) => (
                    <button key={x} type="button" className={cx('chip', st.cse.states.includes(x) && 'on')} aria-pressed={st.cse.states.includes(x)} onClick={() => patchCse({ states: toggle(st.cse.states, x) })}>
                      {x}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Finalidade" htmlFor="cse-purpose" className="span-2">
                <div className="row wrap" style={{ gap: 6 }} id="cse-purpose">
                  {CSE_PURPOSES.map((p) => (
                    <button key={p} type="button" className={cx('chip', st.cse.purposes.includes(p) && 'on')} aria-pressed={st.cse.purposes.includes(p)} onClick={() => patchCse({ purposes: toggle(st.cse.purposes, p) })}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Pedido em" htmlFor="cse-req">
                <input id="cse-req" type="date" className="input" value={st.cse.requestedAt} onChange={(e) => patchCse({ requestedAt: e.target.value })} />
              </Field>
              <Field label="Emitido em" htmlFor="cse-iss" hint="As cópias autenticadas valem 6 meses (art. 70.º, n.º 3).">
                <input id="cse-iss" type="date" className="input" value={st.cse.issuedAt} onChange={(e) => patchCse({ issuedAt: e.target.value })} />
              </Field>
              <Field label="Notas" htmlFor="cse-notes" className="span-2">
                <textarea id="cse-notes" className="textarea" rows={2} value={st.cse.notes} onChange={(e) => patchCse({ notes: e.target.value })} />
              </Field>
            </div>
            <ul className="small subtle" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Pedido pelo herdeiro, legatário, executor ou administrador (art. 63.º) à autoridade do Estado-Membro competente (art. 64.º) — em Portugal, notário ou conservatória do registo civil (a validar).</li>
              <li>Formulário IV (pedido) e V (certificado) do Regulamento de Execução (UE) n.º 1329/2014; produz efeitos em todos os Estados-Membros sem qualquer procedimento (art. 69.º).</li>
              <li>Não substitui os registos nacionais de bens: o registo predial local pode exigir formalidades próprias (art. 1.º, n.º 2, al. l)).</li>
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead icon={Globe} title="Documentos e circulação" subtitle="Apostila, formulários multilingues e legalização por país." />
        <div className="card-body stack" style={{ gap: 12 }}>
          {countries.length === 0 ? (
            <p className="small subtle">Sem países estrangeiros identificados.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>País</th>
                    <th>Regime</th>
                    <th>O que fazer</th>
                    <th>Base</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((x) => {
                    const r = documentRegime(x);
                    return (
                      <tr key={x}>
                        <td className="strong">{x}</td>
                        <td>
                          <span className={cx('badge', r.regime === 'ue' ? 'ok' : r.regime === 'apostila' ? 'brand' : r.regime === 'legalizacao' ? 'warn' : '')}>{r.label}</span>
                        </td>
                        <td className="small">{r.detail}</td>
                        <td className="small subtle">{r.legal || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <details>
            <summary className="small strong">Documentos que normalmente têm de circular</summary>
            <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {INTL_DOCUMENTS.map((d) => (
                <li key={d.key}>
                  <strong>{d.label}</strong> <span className="subtle">({d.from === 'pt' ? 'de Portugal para fora' : 'do estrangeiro para Portugal'})</span> — {d.hint}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </Card>

      <div className="estate-grid">
        <Card>
          <CardHead icon={CalendarClock} title="Prazos de referência por país" subtitle={c.deceased.deathDate ? `Contados do óbito em ${formatDate(c.deceased.deathDate)}. Referências a validar com colega local.` : 'Indique a data do óbito para calcular.'} />
          <div className="card-body">
            {deadlines.length === 0 ? (
              <p className="small subtle">Sem prazos conhecidos para os países envolvidos.</p>
            ) : (
              <ul className="task-list flat">
                {deadlines.map((d) => (
                  <li key={`${d.country}-${d.label}`} className={cx('task-row', d.daysLeft !== null && d.daysLeft < 0 && 'overdue')} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                    <div>
                      <div className="task-title">
                        {d.country} — {d.label}
                      </div>
                      <div className="task-sub">
                        <span>
                          {d.legal}
                          {d.note ? ` · ${d.note}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="task-meta">
                      <span className={cx('due-chip', d.daysLeft !== null && d.daysLeft < 0 ? 'atrasado' : d.daysLeft !== null && d.daysLeft <= 30 ? 'proximo' : '')}>
                        {formatDate(d.dueDate)}
                        {d.daysLeft !== null ? ` · ${d.daysLeft < 0 ? `há ${-d.daysLeft} d` : d.daysLeft === 0 ? 'hoje' : `em ${d.daysLeft} d`}` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {countries.some((x) => COUNTRY_INFO[x]?.notes.length) && (
              <ul className="tiny subtle" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                {countries.flatMap((x) => (COUNTRY_INFO[x]?.notes ?? []).map((n) => <li key={x + n}>{x}: {n}</li>))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHead
            icon={Building2}
            title="Entidades no estrangeiro"
            subtitle="Notaires, bancos, tribunais, consulados, tradutores."
            actions={
              <Button size="sm" icon={Plus} onClick={() => setEntity({ id: uid(), kind: 'notaire', name: '', country: countries[0] ?? '', contact: '', notes: '' })}>
                Entidade
              </Button>
            }
          />
          <div className="card-body">
            {st.entities.length === 0 ? (
              <p className="small subtle">Ainda sem entidades registadas.</p>
            ) : (
              <ul className="task-list flat">
                {st.entities.map((e) => (
                  <li key={e.id} className="task-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                    <button type="button" className="task-main" onClick={() => setEntity(e)}>
                      <span className="task-title">
                        {e.name || ENTITY_KIND_LABELS[e.kind]}
                        {e.country ? ` · ${e.country}` : ''}
                      </span>
                      <span className="task-sub">
                        <span>
                          {ENTITY_KIND_LABELS[e.kind]}
                          {e.contact ? ` · ${e.contact}` : ''}
                        </span>
                      </span>
                    </button>
                    <div className="task-meta">
                      <button type="button" className="btn ghost sm icon" aria-label={`Remover ${e.name}`} onClick={() => patch({ entities: st.entities.filter((x) => x.id !== e.id) })}>
                        <Trash2 aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Sheet
        open={Boolean(entity)}
        onClose={() => setEntity(null)}
        variant="modal"
        title={entity && st.entities.some((x) => x.id === entity.id) ? 'Editar entidade' : 'Nova entidade'}
        icon={Building2}
        footer={
          <>
            <span className="spacer" />
            <Button onClick={() => setEntity(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!entity?.name.trim()}
              onClick={() => {
                if (!entity) return;
                patch({ entities: st.entities.some((x) => x.id === entity.id) ? st.entities.map((x) => (x.id === entity.id ? entity : x)) : [...st.entities, entity] });
                setEntity(null);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        {entity && (
          <div className="form-grid">
            <Field label="Nome *" htmlFor="en-name" className="span-2">
              <input id="en-name" className="input" data-autofocus value={entity.name} onChange={(e) => setEntity({ ...entity, name: e.target.value })} />
            </Field>
            <Field label="Tipo" htmlFor="en-kind">
              <select id="en-kind" className="select" value={entity.kind} onChange={(e) => setEntity({ ...entity, kind: e.target.value as EntityKind })}>
                {(Object.keys(ENTITY_KIND_LABELS) as EntityKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ENTITY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="País" htmlFor="en-country">
              <select id="en-country" className="select" value={entity.country} onChange={(e) => setEntity({ ...entity, country: e.target.value })}>
                <option value="">—</option>
                {ALL_COUNTRIES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contacto" htmlFor="en-contact" className="span-2" hint="Email, telefone, morada, referência do processo.">
              <input id="en-contact" className="input" value={entity.contact} onChange={(e) => setEntity({ ...entity, contact: e.target.value })} />
            </Field>
            <Field label="Notas" htmlFor="en-notes" className="span-2">
              <textarea id="en-notes" className="textarea" rows={2} value={entity.notes} onChange={(e) => setEntity({ ...entity, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
