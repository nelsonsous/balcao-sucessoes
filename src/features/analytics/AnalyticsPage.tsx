import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CircleAlert, CircleCheck, Clock, FileSpreadsheet, FolderOpen, Hourglass, Timer, TrendingUp, Users } from 'lucide-react';
import { formatDuration } from '../../lib/fees';
import { PERIOD_LABELS, analyze, daysLabel, membersCsv, monthsCsv, pct, type Period } from '../../lib/analytics';
import { csvName, downloadCsv } from '../../lib/csv';
import { db } from '../../lib/db';
import { useMembers } from '../../lib/hooks';
import { BarChart, HBarChart } from '../../components/charts';
import { Avatar, Button, Card, CardHead, Empty, KpiCard, Progress, Segmented } from '../../components/ui';

const PERIODS: Period[] = [3, 6, 12, 0];

/** Painel de equipa: métricas por mês, fase e pessoa, com gráficos acessíveis e tabelas alternativas. */
export function AnalyticsPage() {
  const cases = useLiveQuery(() => db.cases.toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const timeEntries = useLiveQuery(() => db.timeEntries.toArray(), []);
  const members = useMembers();
  const [period, setPeriod] = useState<Period>(12);
  const [memberId, setMemberId] = useState('');

  const a = useMemo(() => analyze({ cases: cases ?? [], tasks: tasks ?? [], members, timeEntries: timeEntries ?? [], period, ...(memberId ? { memberId } : {}) }), [cases, tasks, members, timeEntries, period, memberId]);
  const loading = !cases || !tasks;
  const labels = a.months.map((m) => m.label);
  // Eixo compacto: só o mês, com o ano no primeiro ponto e em janeiro.
  const ticks = a.months.map((m, i) => (i === 0 || m.key.endsWith('-01') ? m.label : m.label.slice(0, 3)));
  const phases = a.phases.filter((p) => p.total > 0);

  function exportCsv() {
    const m = membersCsv(a);
    const mo = monthsCsv(a);
    downloadCsv(csvName('analise-equipa'), m.header, m.rows);
    downloadCsv(csvName('analise-meses'), mo.header, mo.rows);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <TrendingUp size={14} aria-hidden /> Escritório
          </div>
          <h1>Análise da equipa</h1>
          <p className="lede">Como está a correr o trabalho: dossiers e prazos por mês, tempo até concluir cada fase e carga por pessoa. Todos os gráficos têm tabela alternativa.</p>
        </div>
        <div className="page-actions">
          <Button icon={FileSpreadsheet} onClick={exportCsv} disabled={loading} title="Exportar as tabelas (CSV)">
            CSV
          </Button>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 10, marginBottom: 14 }}>
        <Segmented label="Período" value={String(period)} onChange={(v) => setPeriod(Number(v) as Period)} options={PERIODS.map((p) => ({ value: String(p), label: PERIOD_LABELS[p] }))} />
        <select className="select" aria-label="Pessoa" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Toda a equipa</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {!loading && (cases?.length ?? 0) === 0 ? (
        <Card>
          <Empty icon={TrendingUp} title="Ainda não há dossiers para analisar" text="Crie dossiers (ou carregue os dados de demonstração em Definições) para ver a evolução da equipa." />
        </Card>
      ) : (
        <>
          <div className="kpi-grid" data-testid="kpis">
            <KpiCard label="Dossiers ativos" value={a.kpis.activeCases} icon={FolderOpen} tone="brand" foot={`${a.kpis.closedCases} encerrados no período`} />
            <KpiCard label="Prazos cumpridos" value={pct(a.kpis.onTimeRate)} icon={CircleCheck} tone="green" foot="Tarefas concluídas dentro do prazo" />
            <KpiCard label="Tarefas em atraso" value={a.kpis.overdueOpen} icon={CircleAlert} tone={a.kpis.overdueOpen ? 'red' : 'grey'} foot={`${a.kpis.openTasks} em aberto`} />
            <KpiCard label="Tarefas concluídas" value={a.kpis.tasksDone} icon={Hourglass} tone="blue" foot="No período" />
            <KpiCard label="Tempo de encerramento" value={daysLabel(a.kpis.meanCloseDays)} icon={Timer} tone="orange" foot="Média, dossiers encerrados no período" />
            <KpiCard label="Horas registadas" value={formatDuration(a.kpis.minutesLogged)} icon={Clock} tone="brand" foot="Honorários, no período" />
          </div>

          <div className="dash-grid" style={{ marginTop: 14 }}>
            <Card className="span-6">
              <div className="card-body">
                <BarChart
                  title="Dossiers por mês"
                  description="Abertos (data de criação) e encerrados (data da última alteração)."
                  categories={labels}
                  tickLabels={ticks}
                  series={[
                    { name: 'Abertos', values: a.months.map((m) => m.opened), color: 'var(--primary)' },
                    { name: 'Encerrados', values: a.months.map((m) => m.closed), color: 'var(--st-concluido)' },
                  ]}
                />
              </div>
            </Card>
            <Card className="span-6">
              <div className="card-body">
                <BarChart
                  title="Prazos por mês"
                  description="Tarefas com prazo concluídas dentro e fora do prazo, por mês de conclusão."
                  categories={labels}
                  tickLabels={ticks}
                  stacked
                  series={[
                    { name: 'Cumpridos', values: a.months.map((m) => m.onTime), color: 'var(--st-concluido)' },
                    { name: 'Falhados', values: a.months.map((m) => m.late), color: 'var(--st-pendente)' },
                  ]}
                />
              </div>
            </Card>
            <Card className="span-6">
              <div className="card-body">
                <HBarChart
                  title="Tempo até concluir cada fase"
                  description="Mediana de dias desde a abertura do dossier até todas as tarefas da fase ficarem concluídas."
                  categories={phases.map((p) => p.label)}
                  values={phases.map((p) => p.medianDays)}
                  unit="dias"
                  notes={phases.map((p) => `${p.casesCompleted} dossier(s)`)}
                />
              </div>
            </Card>
            <Card className="span-6">
              <div className="card-body">
                <BarChart
                  title="Tarefas por fase"
                  description="Concluídas, em aberto e em atraso, em todas as fases com trabalho."
                  categories={phases.map((p) => p.label)}
                  stacked
                  height={260}
                  series={[
                    { name: 'Concluídas', values: phases.map((p) => p.done), color: 'var(--st-concluido)' },
                    { name: 'Em aberto', values: phases.map((p) => p.open - p.overdue), color: 'var(--st-aguarda)' },
                    { name: 'Em atraso', values: phases.map((p) => p.overdue), color: 'var(--st-pendente)' },
                  ]}
                />
              </div>
            </Card>
            <Card className="span-12">
              <CardHead icon={Users} title="Por pessoa" subtitle="Carga atual e desempenho no período (tarefas atribuídas ou, sem atribuição, dos dossiers de que é responsável)." />
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabela por pessoa">
                <table className="table" data-testid="members-table">
                  <thead>
                    <tr>
                      <th scope="col">Pessoa</th>
                      <th scope="col">Dossiers ativos</th>
                      <th scope="col">Tarefas em aberto</th>
                      <th scope="col">Em atraso</th>
                      <th scope="col">Concluídas (30 dias)</th>
                      <th scope="col">Prazos cumpridos</th>
                      <th scope="col">Tempo médio de conclusão</th>
                      <th scope="col">Horas registadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.members.map((m) => (
                      <tr key={m.id}>
                        <th scope="row">
                          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                            <Avatar name={m.name} size="sm" />
                            <span className="pv">{m.name}</span>
                          </span>
                        </th>
                        <td>{m.activeCases}</td>
                        <td>{m.openTasks}</td>
                        <td className={m.overdue ? 'text-danger' : undefined}>{m.overdue}</td>
                        <td>{m.doneRecent}</td>
                        <td>
                          <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 140 }}>
                            <Progress pct={m.onTimeRate === null ? 0 : m.onTimeRate * 100} thin label={`Prazos cumpridos: ${pct(m.onTimeRate)}`} />
                            <span className="small">{pct(m.onTimeRate)}</span>
                          </div>
                        </td>
                        <td>{daysLabel(m.meanCompletionDays)}</td>
                        <td className="tabular">{formatDuration(m.minutesLogged)}</td>
                      </tr>
                    ))}
                    {!a.members.length && (
                      <tr>
                        <td colSpan={8} className="small subtle">
                          Sem membros da equipa — acrescente-os em Definições.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <p className="tiny subtle" style={{ marginTop: 12 }}>
            <CalendarClock size={12} aria-hidden /> Período: desde {a.since === '0000-01-01' ? 'o início' : a.since}. Os encerramentos usam a data da última alteração do dossier. Indicadores de gestão interna, sem valor probatório.
          </p>
        </>
      )}
    </div>
  );
}
