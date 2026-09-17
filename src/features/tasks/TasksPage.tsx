import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  CalendarClock,
  CircleCheck,
  Hourglass,
  Siren,
  FileSpreadsheet,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { setTaskStatus } from '../../lib/actions';
import { isActiveCase, useMemberMap, useMembers, useOverviews } from '../../lib/hooks';
import type { TaskRecord } from '../../lib/types';
import { cx, relativeDays } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { phaseLabel, statusLabel } from '../../engine/phases';
import { PHASE_ICONS } from '../../components/icons';
import { StatusMenu } from '../../components/StatusMenu';
import { Avatar, Button, Card, CardHead, DueChip, Empty, KpiCard } from '../../components/ui';

import { csvName, downloadCsv } from '../../lib/csv';

export function TasksPage() {
  const overviews = useOverviews();
  const members = useMembers();
  const memberMap = useMemberMap();
  const [who, setWho] = useState('');

  const data = useMemo(() => {
    const active = (overviews ?? []).filter((o) => isActiveCase(o.c) && o.c.stage === 'ativo');
    const caseName = new Map(active.map((o) => [o.c.id, o.c.name]));
    const caseResp = new Map(active.map((o) => [o.c.id, o.c.responsibleId]));
    const mine = (t: TaskRecord) => !who || (t.assigneeId || caseResp.get(t.caseId)) === who;
    const pick = (f: (o: (typeof active)[number]) => TaskRecord[]) => active.flatMap(f).filter(mine);
    const soon = active
      .flatMap((o) => o.blockers.dueSoon)
      .filter(mine)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      caseName,
      overdue: pick((o) => o.blockers.overdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      critical: pick((o) => o.blockers.criticalPending),
      awaiting: pick((o) => o.blockers.awaiting),
      soon,
    };
  }, [overviews, who]);

  if (overviews === undefined) return <div className="skeleton" style={{ height: 320 }} />;
  const total = data.overdue.length + data.critical.length + data.awaiting.length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Siren size={14} aria-hidden /> Alertar melhor
          </div>
          <h1>O que está a bloquear?</h1>
          <p className="lede">Prazos ultrapassados, tarefas críticas por iniciar e dependências de terceiros, em todos os dossiers ativos.</p>
        </div>
        <div className="page-actions">
          {members.length > 0 && (
            <select className="select" style={{ width: 'auto' }} aria-label="Responsável" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Toda a equipa</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <Button
            icon={FileSpreadsheet}
            disabled={total === 0 && data.soon.length === 0}
            title="Exportar para Excel (CSV)"
            onClick={() => {
              const row = (group: string, t: TaskRecord) => [group, data.caseName.get(t.caseId) ?? '', t.title, phaseLabel(t.phase), statusLabel(t.status), t.dueDate, t.critical, memberMap.get(t.assigneeId)?.name ?? ''];
              downloadCsv(csvName('bloqueios'), ['Grupo', 'Dossier', 'Tarefa', 'Fase', 'Estado', 'Prazo', 'Crítica', 'Responsável'], [
                ...data.overdue.map((t) => row('Prazo ultrapassado', t)),
                ...data.critical.map((t) => row('Crítica por iniciar', t)),
                ...data.awaiting.map((t) => row('A aguardar terceiros', t)),
                ...data.soon.map((t) => row('Prazo nos próximos 30 dias', t)),
              ]);
            }}
          >
            CSV
          </Button>
        </div>
      </div>

      <div className="kpi-grid four">
        <KpiCard label="Prazos ultrapassados" value={data.overdue.length} icon={TriangleAlert} tone="red" />
        <KpiCard label="Críticas por iniciar" value={data.critical.length} icon={Siren} tone="red" />
        <KpiCard label="A aguardar terceiros" value={data.awaiting.length} icon={Hourglass} tone="blue" />
        <KpiCard label="Prazos nos próximos 30 dias" value={data.soon.length} icon={CalendarClock} tone="orange" />
      </div>

      {total === 0 && data.soon.length === 0 ? (
        <Card>
          <Empty icon={CircleCheck} title="Nada a bloquear" text="Sem prazos ultrapassados, tarefas críticas por iniciar ou dependências de terceiros." />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <Group title="Prazos ultrapassados" icon={TriangleAlert} tone="red" tasks={data.overdue} caseName={data.caseName} memberMap={memberMap} />
          <Group title="Tarefas críticas por iniciar" icon={Siren} tone="red" tasks={data.critical} caseName={data.caseName} memberMap={memberMap} />
          <Group title="A aguardar terceiros" icon={Hourglass} tone="blue" tasks={data.awaiting} caseName={data.caseName} memberMap={memberMap} />
          <Group title="Prazos nos próximos 30 dias" icon={CalendarClock} tone="orange" tasks={data.soon} caseName={data.caseName} memberMap={memberMap} />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  icon,
  tone,
  tasks,
  caseName,
  memberMap,
}: {
  title: string;
  icon: LucideIcon;
  tone: 'red' | 'blue' | 'orange';
  tasks: TaskRecord[];
  caseName: Map<string, string>;
  memberMap: ReturnType<typeof useMemberMap>;
}) {
  if (!tasks.length) return null;
  return (
    <Card className={cx('group-card', `tone-${tone}`)}>
      <CardHead icon={icon} title={title} subtitle={`${tasks.length} tarefa(s)`} />
      <div className="card-body">
        <ul className="task-list flat">
          {tasks.map((t) => {
            const Icon = PHASE_ICONS[t.phase];
            const ds = dueState(t.dueDate, t.status);
            return (
              <li key={t.id} className={cx('task-row', ds === 'atrasado' && 'overdue')}>
                <div className="task-status">
                  <StatusMenu status={t.status} onChange={(s) => void setTaskStatus(t, s)} compact />
                </div>
                <Link href={`/dossiers/${t.caseId}`} className="task-main">
                  <span className="task-title">
                    {t.critical && <TriangleAlert className="crit-icon" size={14} aria-label="Crítica" />}
                    {t.title}
                  </span>
                  <span className="task-sub">
                    <Icon size={12} aria-hidden /> {phaseLabel(t.phase)} · <strong>{caseName.get(t.caseId)}</strong>
                    {t.dueDate && ds !== 'cumprido' && <span> · {relativeDays(t.dueDate)}</span>}
                  </span>
                </Link>
                <div className="task-meta">
                  <DueChip date={t.dueDate} status={t.status} withRelative={false} />
                  {t.assigneeId && <Avatar member={memberMap.get(t.assigneeId)} size="sm" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
