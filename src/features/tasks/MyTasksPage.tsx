import { useMemo } from 'react';
import { Link } from 'wouter';
import { CalendarClock, CircleCheck, TriangleAlert, UserCheck } from 'lucide-react';
import { setTaskStatus } from '../../lib/actions';
import { setSetting, useSettings } from '../../lib/db';
import { useMembers, useOverviews } from '../../lib/hooks';
import { groupMyTasks } from '../../lib/myTasks';
import { cx, formatDate, relativeDays } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { phaseLabel } from '../../engine/phases';
import { StatusMenu } from '../../components/StatusMenu';
import { Card, CardHead, Empty, Field, KpiCard } from '../../components/ui';

/** Página pessoal: tudo o que está atribuído a mim, por urgência. */
export function MyTasksPage() {
  const settings = useSettings();
  const members = useMembers();
  const overviews = useOverviews();
  const me = members.find((m) => m.id === settings.meId);

  const groups = useMemo(() => groupMyTasks((overviews ?? []).map((o) => ({ c: o.c, tasks: o.tasks })), settings.meId), [overviews, settings.meId]);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const by = (id: string) => groups.find((g) => g.id === id)?.tasks.length ?? 0;
  const casesCount = new Set(groups.flatMap((g) => g.tasks.map((x) => x.c.id))).size;

  if (overviews === undefined) return <div className="skeleton" style={{ height: 320 }} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <UserCheck size={14} aria-hidden /> O meu dia
          </div>
          <h1>{me ? `As tarefas de ${me.name.split(' ')[0]}` : 'As minhas tarefas'}</h1>
          <p className="lede">Tarefas em aberto atribuídas a si — ou de dossiers de que é responsável — em todos os dossiers ativos.</p>
        </div>
        <div className="page-actions">
          <Field label="Na equipa, eu sou" htmlFor="me-select">
            <select id="me-select" className="select" value={settings.meId} onChange={(e) => void setSetting('meId', e.target.value)}>
              <option value="">— escolher —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {!settings.meId ? (
        <Card>
          <Empty icon={UserCheck} title="Diga-nos quem é" text={members.length ? 'Escolha o seu nome na equipa (canto superior direito) para ver as suas tarefas.' : 'Ainda não há pessoas na equipa. Adicione-as em Definições → Equipa e escolha o seu nome.'} />
        </Card>
      ) : (
        <>
          <div className="kpi-grid four">
            <KpiCard label="Atrasadas" value={by('atrasadas')} icon={TriangleAlert} tone="red" />
            <KpiCard label="Para hoje" value={by('hoje')} icon={CalendarClock} tone="orange" />
            <KpiCard label="Esta semana" value={by('semana')} icon={CalendarClock} tone="blue" />
            <KpiCard label="Em aberto" value={total} icon={CircleCheck} tone="brand" foot={`${casesCount} dossier(s)`} />
          </div>
          {total === 0 ? (
            <Card>
              <Empty icon={CircleCheck} title="Tudo em dia" text="Não tem tarefas em aberto atribuídas. Bom trabalho." />
            </Card>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {groups
                .filter((g) => g.tasks.length)
                .map((g) => (
                  <Card key={g.id}>
                    <CardHead title={g.label} subtitle={`${g.tasks.length} tarefa(s)`} />
                    <ul className="task-list flat">
                      {g.tasks.map(({ t, c }) => {
                        const ds = dueState(t.dueDate, t.status);
                        return (
                          <li key={t.id} className={cx('task-row', `st-${t.status}`, ds === 'atrasado' && 'overdue')}>
                            <div className="task-status">
                              <StatusMenu status={t.status} onChange={(s) => void setTaskStatus(t, s)} compact />
                            </div>
                            <Link href={`/dossiers/${c.id}?tarefa=${t.id}`} className="task-main">
                              <span className="task-title">
                                {t.critical && <TriangleAlert className="crit-icon" size={14} aria-label="Crítica" />}
                                {t.title}
                              </span>
                              <span className="task-sub">
                                <span>
                                  {c.ref} · <span className="pv">{c.name}</span> · {phaseLabel(t.phase)}
                                </span>
                              </span>
                            </Link>
                            <div className="task-meta">
                              {t.dueDate && (
                                <span className={cx('due-chip', ds)} title={formatDate(t.dueDate, 'long')}>
                                  {formatDate(t.dueDate, 'daymonth')} · {relativeDays(t.dueDate)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
