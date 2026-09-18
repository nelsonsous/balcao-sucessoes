import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CirclePause, CirclePlay, Clock, Coins, FileSpreadsheet, FileText, HandCoins, Receipt, Scale, Trash2, Wallet } from 'lucide-react';
import { csvName, downloadCsv } from '../../lib/csv';
import { db, useSettings } from '../../lib/db';
import {
  EXPENSE_CATEGORIES,
  addExpense,
  addProvision,
  addTimeEntry,
  categoryLabel,
  deleteExpense,
  deleteProvision,
  deleteTimeEntry,
  discardTimer,
  elapsedMinutes,
  feeSummary,
  feesCsv,
  formatDuration,
  parseDuration,
  readFees,
  saveFees,
  startTimer,
  stopTimer,
  updateExpense,
  updateTimeEntry,
} from '../../lib/fees';
import { useMembers } from '../../lib/hooks';
import type { CaseRecord, ExpenseCategory, FeesConfig } from '../../lib/types';
import { formatDate, formatEur, parseAmount, todayIso } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty, Field, KpiCard, Segmented } from '../../components/ui';

/** Relógio do cronómetro (hh:mm:ss), atualizado a cada segundo. */
function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <span className="timer-clock tabular" aria-live="off">
      {hh}:{mm}:{ss}
    </span>
  );
}

/** Separador «Honorários»: acordo, cronómetro, tempo, despesas, provisões e nota de honorários. */
export function FeesTab({ c, onReport }: { c: CaseRecord; onReport: () => void }) {
  const toast = useToast();
  const settings = useSettings();
  const members = useMembers();
  const entries = useLiveQuery(() => db.timeEntries.where('caseId').equals(c.id).toArray(), [c.id]);
  const expenses = useLiveQuery(() => db.expenses.where('caseId').equals(c.id).toArray(), [c.id]);
  const provisions = useLiveQuery(() => db.provisions.where('caseId').equals(c.id).toArray(), [c.id]);
  const cfg = useMemo(() => readFees(c), [c]);
  const s = useMemo(
    () => feeSummary({ entries: entries ?? [], expenses: expenses ?? [], provisions: provisions ?? [], cfg, members, settings }),
    [entries, expenses, provisions, cfg, members, settings],
  );
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const lineOf = useMemo(() => new Map(s.lines.map((l) => [l.entry.id, l])), [s.lines]);
  const timer = settings.activeTimer;
  const otherTimerCase = useLiveQuery(async () => (timer && timer.caseId !== c.id ? db.cases.get(timer.caseId) : undefined), [timer?.caseId, c.id]);

  // Acordo
  const [draft, setDraft] = useState<FeesConfig>(cfg);
  useEffect(() => setDraft(cfg), [cfg]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg);

  // Formulários
  const me = settings.meId || c.responsibleId;
  const [te, setTe] = useState({ date: todayIso(), duration: '', memberId: me, description: '', billable: true });
  const [ex, setEx] = useState({ date: todayIso(), category: 'certidoes' as ExpenseCategory, description: '', amount: '', billable: true });
  const [pv, setPv] = useState({ date: todayIso(), amount: '', description: '' });
  const [timerText, setTimerText] = useState('');
  const teMinutes = parseDuration(te.duration);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast({ tone: 'success', title: ok });
      return true;
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível registar', description: (e as Error).message });
      return false;
    }
  }

  const exportCsv = () => {
    const t = feesCsv(s, expenses ?? [], provisions ?? [], members);
    downloadCsv(csvName(`honorarios-${c.ref}`), t.header, t.rows);
  };

  const rateHint = `Por omissão: ${formatEur(settings.hourlyRate)}/h (Definições) ou a taxa de cada pessoa.`;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar">
        <div>
          <h2>Honorários e despesas</h2>
          <p className="subtle small">Tempo, despesas por conta do cliente e provisões — para a nota de honorários. A fatura emite-se no programa certificado do escritório.</p>
        </div>
        <span className="spacer" />
        <Button icon={FileSpreadsheet} onClick={exportCsv} disabled={!entries?.length && !expenses?.length && !provisions?.length}>
          CSV
        </Button>
        <Button variant="primary" icon={FileText} onClick={onReport}>
          Nota de honorários
        </Button>
      </div>

      <div className="kpi-grid" data-testid="fees-kpis">
        <KpiCard label="Tempo registado" value={formatDuration(s.minutes)} icon={Clock} tone="brand" foot={`${formatDuration(s.billableMinutes)} faturável`} />
        <KpiCard label="Honorários" value={formatEur(s.feesNet)} icon={Scale} tone="blue" foot={cfg.mode === 'fixo' ? `Valor fixo${s.effectiveRate !== null ? ` · ${formatEur(s.effectiveRate)}/h efetivos` : ''}` : `Sem IVA · + ${formatEur(s.vat)} de IVA`} />
        <KpiCard label="Despesas" value={formatEur(s.expensesBillable)} icon={Receipt} tone="orange" foot={`a debitar · ${formatEur(s.expensesTotal)} no total`} />
        <KpiCard label="Provisões" value={formatEur(s.provisions)} icon={HandCoins} tone="green" foot="recebidas do cliente" />
        <KpiCard label={s.due >= 0 ? 'A pagar pelo cliente' : 'A devolver ao cliente'} value={formatEur(Math.abs(s.due))} icon={Wallet} tone={s.due > 0 ? 'red' : 'grey'} foot={s.withholding ? `com IVA e retenção de ${formatEur(s.withholding)}` : 'com IVA, despesas e provisões'} />
      </div>

      <div className="estate-grid">
        <Card>
          <CardHead icon={Clock} title="Cronómetro" subtitle="Um cronómetro de cada vez, neste dispositivo; ao parar, fica registado o tempo (mínimo 1 minuto)." />
          <div className="card-body stack" style={{ gap: 10 }}>
            {timer && timer.caseId === c.id ? (
              <div className="timer-running" data-testid="timer-running">
                <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                  <Elapsed startedAt={timer.startedAt} />
                  <span className="small subtle">{timer.description || 'Trabalho no dossier'}</span>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Button
                    variant="primary"
                    icon={CirclePause}
                    onClick={() =>
                      void (async () => {
                        const e = await stopTimer();
                        if (e) toast({ tone: 'success', title: `Registado: ${formatDuration(e.minutes)}`, description: e.description });
                      })()
                    }
                  >
                    Parar e registar
                  </Button>
                  <Button variant="ghost" onClick={() => void discardTimer()}>
                    Descartar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {timer && otherTimerCase && (
                  <p className="small subtle">
                    Há um cronómetro a correr em {otherTimerCase.ref} · {otherTimerCase.name} ({elapsedMinutes(timer)} min). Iniciar aqui regista-o primeiro.
                  </p>
                )}
                <Field label="O que está a fazer" htmlFor="tm-desc">
                  <input id="tm-desc" className="input" placeholder="Ex.: reunião com o cliente, análise do testamento…" value={timerText} onChange={(e) => setTimerText(e.target.value)} />
                </Field>
                <div>
                  <Button
                    variant="primary"
                    icon={CirclePlay}
                    onClick={() =>
                      void (async () => {
                        const r = await startTimer(c.id, timerText, me);
                        setTimerText('');
                        if (r.stopped) toast({ title: `Cronómetro anterior registado: ${formatDuration(r.stopped.minutes)}` });
                      })()
                    }
                  >
                    Iniciar cronómetro
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={Scale} title="Acordo de honorários" subtitle="Por hora (tempo × taxa) ou valor fixo; a retenção na fonte aplica-se a clientes com contabilidade organizada." />
          <div className="card-body stack" style={{ gap: 10 }}>
            <Segmented<FeesConfig['mode']>
              label="Modalidade"
              value={draft.mode}
              onChange={(mode) => setDraft({ ...draft, mode })}
              options={[
                { value: 'horas', label: 'Por hora' },
                { value: 'fixo', label: 'Valor fixo' },
              ]}
            />
            <div className="form-grid">
              {draft.mode === 'fixo' ? (
                <Field label="Honorários acordados (sem IVA)" htmlFor="fe-fixed">
                  <input id="fe-fixed" className="input" inputMode="decimal" value={draft.fixedFee === null ? '' : String(draft.fixedFee).replace('.', ',')} placeholder="0,00" onChange={(e) => setDraft({ ...draft, fixedFee: parseAmount(e.target.value) })} />
                </Field>
              ) : (
                <Field label="Taxa horária deste dossier (€/h)" htmlFor="fe-rate" hint={rateHint}>
                  <input id="fe-rate" className="input" inputMode="decimal" value={draft.rate === null ? '' : String(draft.rate).replace('.', ',')} placeholder={String(settings.hourlyRate)} onChange={(e) => setDraft({ ...draft, rate: parseAmount(e.target.value) })} />
                </Field>
              )}
              <div className="stack" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <label className="checkbox">
                  <input type="checkbox" checked={draft.withholding} onChange={(e) => setDraft({ ...draft, withholding: e.target.checked })} />
                  Retenção na fonte de IRS ({settings.withholdingRate}%)
                </label>
              </div>
            </div>
            <Field label="Observações do acordo" htmlFor="fe-notes">
              <input id="fe-notes" className="input" placeholder="Ex.: provisão inicial de 500 €; despesas debitadas ao custo" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <div>
              <Button variant="primary" disabled={!dirty} onClick={() => void run(() => saveFees(c.id, draft), 'Acordo de honorários guardado')}>
                Guardar acordo
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead icon={Clock} title="Tempo registado" subtitle={`O tempo faturável arredonda a blocos de ${settings.timeRounding || 1} min por registo. Toque em «faturável» para excluir um registo da nota.`} />
        <div className="card-body stack" style={{ gap: 12 }}>
          <form
            className="fees-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!teMinutes) return;
              void run(() => addTimeEntry(c.id, { date: te.date, minutes: teMinutes, memberId: te.memberId, description: te.description.trim(), billable: te.billable }), 'Tempo registado').then((ok) => ok && setTe({ ...te, duration: '', description: '' }));
            }}
          >
            <Field label="Data" htmlFor="te-date">
              <input id="te-date" type="date" className="input" value={te.date} onChange={(e) => setTe({ ...te, date: e.target.value })} />
            </Field>
            <Field label="Duração" htmlFor="te-dur" hint={te.duration && !teMinutes ? undefined : 'Ex.: 1:30, 45m, 2h'} error={te.duration && !teMinutes ? 'Use 1:30, 1h30, 45m ou 1,5.' : undefined}>
              <input id="te-dur" className="input" inputMode="text" placeholder="1:30" value={te.duration} onChange={(e) => setTe({ ...te, duration: e.target.value })} />
            </Field>
            <Field label="Pessoa" htmlFor="te-member">
              <select id="te-member" className="select" value={te.memberId} onChange={(e) => setTe({ ...te, memberId: e.target.value })}>
                <option value="">— sem pessoa —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição" htmlFor="te-desc" className="span-2">
              <input id="te-desc" className="input" placeholder="Ex.: preparação da habilitação de herdeiros" value={te.description} onChange={(e) => setTe({ ...te, description: e.target.value })} />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={te.billable} onChange={(e) => setTe({ ...te, billable: e.target.checked })} />
              Faturável
            </label>
            <div>
              <Button type="submit" variant="primary" disabled={!teMinutes}>
                Registar tempo
              </Button>
            </div>
          </form>
          {entries && entries.length === 0 ? (
            <Empty icon={Clock} title="Sem tempo registado" text="Use o cronómetro ou registe o tempo à mão." />
          ) : (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Registos de tempo">
              <table className="table" data-testid="time-table">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Descrição</th>
                    <th scope="col">Tempo</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Faturável</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...(entries ?? [])]
                    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
                    .map((e) => {
                      const l = lineOf.get(e.id);
                      return (
                        <tr key={e.id} className={e.billable ? undefined : 'muted-row'}>
                          <td className="small">{formatDate(e.date)}</td>
                          <td className="small pv">{memberName.get(e.memberId) ?? '—'}</td>
                          <td>{e.description || '—'}</td>
                          <td className="tabular">{formatDuration(e.minutes)}</td>
                          <td className="tabular">{l ? formatEur(l.amount) : '—'}</td>
                          <td>
                            <input type="checkbox" aria-label={`Faturável: ${e.description || formatDuration(e.minutes)}`} checked={e.billable} onChange={(ev) => void updateTimeEntry(e, { billable: ev.target.checked })} />
                          </td>
                          <td>
                            <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remover registo de ${formatDuration(e.minutes)}`} onClick={() => void deleteTimeEntry(e)} />
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

      <div className="estate-grid">
        <Card>
          <CardHead icon={Receipt} title="Despesas" subtitle="Emolumentos, certidões, custas, traduções… As marcadas «a debitar» entram na nota de honorários." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <form
              className="fees-form"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = parseAmount(ex.amount);
                if (!amount) return;
                void run(() => addExpense(c.id, { date: ex.date, category: ex.category, description: ex.description.trim(), amount, billable: ex.billable }), 'Despesa registada').then((ok) => ok && setEx({ ...ex, description: '', amount: '' }));
              }}
            >
              <Field label="Data" htmlFor="ex-date">
                <input id="ex-date" type="date" className="input" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} />
              </Field>
              <Field label="Categoria" htmlFor="ex-cat">
                <select id="ex-cat" className="select" value={ex.category} onChange={(e) => setEx({ ...ex, category: e.target.value as ExpenseCategory })}>
                  {EXPENSE_CATEGORIES.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição" htmlFor="ex-desc">
                <input id="ex-desc" className="input" placeholder="Ex.: certidão de óbito" value={ex.description} onChange={(e) => setEx({ ...ex, description: e.target.value })} />
              </Field>
              <Field label="Valor (€)" htmlFor="ex-amount">
                <input id="ex-amount" className="input" inputMode="decimal" placeholder="0,00" value={ex.amount} onChange={(e) => setEx({ ...ex, amount: e.target.value })} />
              </Field>
              <label className="checkbox">
                <input type="checkbox" checked={ex.billable} onChange={(e) => setEx({ ...ex, billable: e.target.checked })} />A debitar ao cliente
              </label>
              <div>
                <Button type="submit" variant="primary" disabled={!parseAmount(ex.amount)}>
                  Registar despesa
                </Button>
              </div>
            </form>
            {expenses && expenses.length > 0 && (
              <ul className="fees-list" data-testid="expenses-list">
                {[...expenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((x) => (
                    <li key={x.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong>{x.description || categoryLabel(x.category)}</strong>
                        <div className="tiny subtle">
                          {formatDate(x.date)} · {categoryLabel(x.category)}
                        </div>
                      </div>
                      <label className="checkbox small">
                        <input type="checkbox" checked={x.billable} onChange={(ev) => void updateExpense(x, { billable: ev.target.checked })} />a debitar
                      </label>
                      <span className="tabular strong">{formatEur(x.amount)}</span>
                      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remover despesa de ${formatEur(x.amount)}`} onClick={() => void deleteExpense(x)} />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={Coins} title="Provisões recebidas" subtitle="Adiantamentos do cliente; descontam no total a pagar." />
          <div className="card-body stack" style={{ gap: 12 }}>
            <form
              className="fees-form"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = parseAmount(pv.amount);
                if (!amount) return;
                void run(() => addProvision(c.id, { date: pv.date, amount, description: pv.description.trim() }), 'Provisão registada').then((ok) => ok && setPv({ ...pv, amount: '', description: '' }));
              }}
            >
              <Field label="Data" htmlFor="pv-date">
                <input id="pv-date" type="date" className="input" value={pv.date} onChange={(e) => setPv({ ...pv, date: e.target.value })} />
              </Field>
              <Field label="Valor (€)" htmlFor="pv-amount">
                <input id="pv-amount" className="input" inputMode="decimal" placeholder="0,00" value={pv.amount} onChange={(e) => setPv({ ...pv, amount: e.target.value })} />
              </Field>
              <Field label="Descrição" htmlFor="pv-desc">
                <input id="pv-desc" className="input" placeholder="Ex.: provisão inicial" value={pv.description} onChange={(e) => setPv({ ...pv, description: e.target.value })} />
              </Field>
              <div>
                <Button type="submit" variant="primary" disabled={!parseAmount(pv.amount)}>
                  Registar provisão
                </Button>
              </div>
            </form>
            {provisions && provisions.length > 0 && (
              <ul className="fees-list" data-testid="provisions-list">
                {[...provisions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((x) => (
                    <li key={x.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong>{x.description || 'Provisão'}</strong>
                        <div className="tiny subtle">{formatDate(x.date)}</div>
                      </div>
                      <span className="tabular strong">{formatEur(x.amount)}</span>
                      <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label={`Remover provisão de ${formatEur(x.amount)}`} onClick={() => void deleteProvision(x)} />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
      <p className="tiny subtle">
        A nota de honorários é um documento de apoio (pró-forma): a fatura emite-se num programa de faturação certificado pela AT. Taxas de IVA ({settings.vatRate}%) e de retenção ({settings.withholdingRate}%) configuráveis em Definições — a validar pela equipa.
      </p>
    </div>
  );
}
