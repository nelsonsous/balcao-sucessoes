import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { setTaskStatus } from '../../lib/actions';
import type { MemberRecord, Status, TaskRecord } from '../../lib/types';
import { cx } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { PHASE_INDEX, STATUSES, isOpen, phaseLabel } from '../../engine/phases';
import { Avatar, DueChip } from '../../components/ui';

/** Quadro por estado: arrastar uma tarefa para outra coluna muda o estado. */
export function ChecklistBoard({ tasks, members, onOpen }: { tasks: TaskRecord[]; members: Map<string, MemberRecord>; onOpen: (t: TaskRecord) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);

  const drop = async (status: Status) => {
    const t = tasks.find((x) => x.id === dragging);
    setOver(null);
    setDragging(null);
    if (t && t.status !== status) await setTaskStatus(t, status);
  };

  return (
    <div className="board" role="list" aria-label="Quadro de tarefas por estado">
      {STATUSES.map((s) => {
        const list = tasks.filter((t) => t.status === s.id).sort((a, b) => PHASE_INDEX[a.phase] - PHASE_INDEX[b.phase] || a.order - b.order);
        return (
          <section
            key={s.id}
            className={cx('board-col', `st-${s.id}`, over === s.id && 'over')}
            role="listitem"
            aria-label={`${s.label}: ${list.length} tarefa(s)`}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== s.id) setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              void drop(s.id);
            }}
          >
            <header className="board-head">
              <span className={cx('dot', s.id)} aria-hidden />
              <span className="board-title">{s.label}</span>
              <span className="board-count tabular">{list.length}</span>
            </header>
            <div className="board-cards">
              {list.length === 0 && <div className="board-empty">Largue aqui</div>}
              {list.map((t) => {
                const ds = dueState(t.dueDate, t.status);
                const assignee = members.get(t.assigneeId);
                return (
                  <article
                    key={t.id}
                    className={cx('board-card', dragging === t.id && 'dragging', ds === 'atrasado' && 'overdue')}
                    draggable
                    onDragStart={(e) => {
                      setDragging(t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', t.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <button type="button" className="board-card-main" onClick={() => onOpen(t)}>
                      <span className="board-card-title">
                        {t.critical && isOpen(t.status) && <TriangleAlert className="crit-icon" size={13} aria-label="Crítica" />}
                        {t.title}
                      </span>
                      <span className="board-card-phase">{phaseLabel(t.phase)}</span>
                    </button>
                    <div className="board-card-foot">
                      <DueChip date={t.dueDate} status={t.status} withRelative={false} />
                      <span className="spacer" />
                      {assignee && <Avatar member={assignee} size="sm" />}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
