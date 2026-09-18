import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight, TriangleAlert } from 'lucide-react';
import { setTaskStatus } from '../../lib/actions';
import type { MemberRecord, Status, TaskRecord } from '../../lib/types';
import { cx } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { PHASE_INDEX, STATUSES, isOpen, phaseLabel, statusLabel } from '../../engine/phases';
import { Avatar, DueChip, Menu } from '../../components/ui';

const ORDER: Status[] = STATUSES.map((s) => s.id);

/** Coluna ao lado (sem dar a volta): Shift + ← / → no teclado. */
export function neighbourStatus(status: Status, dir: -1 | 1): Status | null {
  const i = ORDER.indexOf(status) + dir;
  return i >= 0 && i < ORDER.length ? ORDER[i]! : null;
}

/**
 * Quadro por estado. Três maneiras de mudar o estado de uma tarefa: arrastar para outra
 * coluna (rato), o botão «Mudar o estado» de cada cartão (um toque, sem arrastar) e o
 * teclado — setas para percorrer os cartões, Shift + ← / → para passar à coluna ao lado.
 */
export function ChecklistBoard({ tasks, members, onOpen }: { tasks: TaskRecord[]; members: Map<string, MemberRecord>; onOpen: (t: TaskRecord) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const hintId = useId();
  // Depois de mudar o estado pelo teclado, o foco segue o cartão para a nova coluna.
  const refocus = useRef<string | null>(null);

  const columns = STATUSES.map((s) => ({ s, list: tasks.filter((t) => t.status === s.id).sort((a, b) => PHASE_INDEX[a.phase] - PHASE_INDEX[b.phase] || a.order - b.order) }));

  const focusCard = (id: string | undefined) => {
    if (!id) return;
    root.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(id)}"]`)?.focus();
  };

  useEffect(() => {
    if (!refocus.current) return;
    const id = refocus.current;
    const el = root.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(id)}"]`);
    const t = tasks.find((x) => x.id === id);
    if (el && t && el.closest(`[data-status="${t.status}"]`)) {
      el.focus();
      refocus.current = null;
    }
  }, [tasks]);

  const move = async (t: TaskRecord, status: Status) => {
    if (t.status === status) return;
    refocus.current = t.id;
    await setTaskStatus(t, status);
  };

  const drop = async (status: Status) => {
    const t = tasks.find((x) => x.id === dragging);
    setOver(null);
    setDragging(null);
    if (t && t.status !== status) await setTaskStatus(t, status);
  };

  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, t: TaskRecord, col: number, row: number) => {
    const list = columns[col]!.list;
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const to = neighbourStatus(t.status, e.key === 'ArrowRight' ? 1 : -1);
      if (to) void move(t, to);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusCard(list[Math.max(0, Math.min(list.length - 1, row + (e.key === 'ArrowDown' ? 1 : -1)))]?.id);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusCard((e.key === 'Home' ? list[0] : list[list.length - 1])?.id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      // coluna ao lado com cartões, na mesma linha (ou a última)
      for (let c = col + (e.key === 'ArrowRight' ? 1 : -1); c >= 0 && c < columns.length; c += e.key === 'ArrowRight' ? 1 : -1) {
        const other = columns[c]!.list;
        if (other.length) {
          focusCard(other[Math.min(row, other.length - 1)]!.id);
          break;
        }
      }
    }
  };

  return (
    <div className="board" role="list" aria-label="Quadro de tarefas por estado" ref={root}>
      <p id={hintId} className="sr-only">
        Setas: percorrer as tarefas. Shift com seta para a esquerda ou para a direita: passar a tarefa para a coluna ao lado. Enter: abrir a tarefa.
      </p>
      {columns.map(({ s, list }, col) => (
        <div
          key={s.id}
          className={cx('board-col', `st-${s.id}`, over === s.id && 'over')}
          role="listitem"
          aria-label={`${s.label}: ${list.length} tarefa(s)`}
          data-status={s.id}
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
            {list.map((t, row) => {
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
                  <button type="button" className="board-card-main" data-board-card={t.id} aria-describedby={hintId} onClick={() => onOpen(t)} onKeyDown={(e) => onCardKey(e, t, col, row)}>
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
                    <Menu
                      ariaLabel={`Mudar o estado de «${t.title}»`}
                      items={STATUSES.filter((x) => x.id !== t.status).map((x) => ({ label: x.label, description: x.description, onSelect: () => void move(t, x.id) }))}
                      button={(p) => (
                        <button type="button" className="btn ghost sm icon board-move" title={`Mudar o estado (agora: ${statusLabel(t.status)})`} {...p}>
                          <ArrowLeftRight aria-hidden />
                        </button>
                      )}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
