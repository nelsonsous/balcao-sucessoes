import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, KanbanSquare, Lightbulb, List, ListChecks, Plus, Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { addCustomTask, bulkSetStatus, bulkUpdateTasks, deleteManualTasks, setTaskStatus } from '../../lib/actions';
import { useMemberMap, useMembers } from '../../lib/hooks';
import { ChecklistBoard } from './ChecklistBoard';
import { STATUSES } from '../../engine/phases';
import { isOfficeKey } from '../../engine/officeRules';
import type { CaseRecord, MemberRecord, PhaseId, Status, TaskRecord } from '../../lib/types';
import { cx, normalize } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { PHASES, isOpen } from '../../engine/phases';
import { PHASE_ICONS } from '../../components/icons';
import { StatusMenu } from '../../components/StatusMenu';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, DueChip, Empty, Field, Segmented, Sheet, useConfirm } from '../../components/ui';

const VIEW_KEY = 'bs-checklist-view';
type ChecklistView = 'lista' | 'quadro';
function loadView(): ChecklistView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'quadro' ? 'quadro' : 'lista';
  } catch {
    return 'lista';
  }
}

export type ChecklistFilter = 'todas' | 'abertas' | 'criticas' | 'prazos' | 'rever' | Status;

const FILTERS: Array<{ value: ChecklistFilter; label: string }> = [
  { value: 'abertas', label: 'Em aberto' },
  { value: 'criticas', label: 'Críticas' },
  { value: 'prazos', label: 'Com prazo' },
  { value: 'todas', label: 'Todas' },
];

function matches(t: TaskRecord, f: ChecklistFilter): boolean {
  switch (f) {
    case 'todas':
      return !t.obsolete;
    case 'abertas':
      return !t.obsolete && isOpen(t.status);
    case 'criticas':
      return !t.obsolete && t.critical && isOpen(t.status);
    case 'prazos':
      return !t.obsolete && Boolean(t.dueDate) && isOpen(t.status);
    case 'rever':
      return t.obsolete;
    default:
      return !t.obsolete && t.status === f;
  }
}

export function ChecklistTab({
  c,
  tasks,
  filter,
  onFilter,
  onOpen,
}: {
  c: CaseRecord;
  tasks: TaskRecord[];
  filter: ChecklistFilter;
  onFilter: (f: ChecklistFilter) => void;
  onOpen: (t: TaskRecord) => void;
}) {
  const members = useMemberMap();
  const memberList = useMembers();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<PhaseId>>(new Set());
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<ChecklistView>(loadView);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignora */
    }
  }, [view]);
  // Limpa seleções de tarefas que já não existem
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(tasks.map((t) => t.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [tasks]);

  const counts = useMemo(() => {
    const out: Partial<Record<ChecklistFilter, number>> = {};
    for (const f of FILTERS) out[f.value] = tasks.filter((t) => matches(t, f.value)).length;
    return out;
  }, [tasks]);

  const visible = useMemo(() => {
    const n = normalize(q);
    return tasks
      .filter((t) => matches(t, filter))
      .filter((t) => !n || normalize(`${t.title} ${t.description} ${t.notes}`).includes(n))
      .sort((a, b) => a.order - b.order);
  }, [tasks, filter, q]);

  const statusFilterLabel = !FILTERS.some((f) => f.value === filter)
    ? filter === 'rever'
      ? 'A rever'
      : ({ pendente: 'Pendentes', em_curso: 'Em curso', aguarda: 'A aguardar', concluido: 'Concluídas', na: 'N/A' } as Record<string, string>)[filter]
    : null;

  const toggle = (p: PhaseId) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  // Quadro: todas as tarefas vivas, respeitando só a pesquisa e os filtros “críticas”/“com prazo”.
  const boardTasks = useMemo(() => {
    const n = normalize(q);
    return tasks.filter((t) => !t.obsolete).filter((t) => (filter === 'criticas' ? t.critical : filter === 'prazos' ? Boolean(t.dueDate) : true)).filter((t) => !n || normalize(`${t.title} ${t.description} ${t.notes}`).includes(n));
  }, [tasks, filter, q]);

  const selectedTasks = tasks.filter((t) => selected.has(t.id));
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const bulk = async (what: string, fn: () => Promise<number>) => {
    const n = await fn();
    toast({ tone: 'success', title: `${n} tarefa(s): ${what}` });
    exitSelect();
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar">
        <Segmented
          label="Filtrar tarefas"
          value={FILTERS.some((f) => f.value === filter) ? filter : ('__' as ChecklistFilter)}
          onChange={onFilter}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))}
        />
        {statusFilterLabel && (
          <span className="badge brand">
            Filtro: {statusFilterLabel}
            <button type="button" className="chip-x" aria-label="Limpar filtro" onClick={() => onFilter('abertas')}>
              ×
            </button>
          </span>
        )}
        <span className="spacer" />
        <div className="input-group" style={{ width: 220 }}>
          <Search aria-hidden />
          <input className="input" style={{ height: 34 }} placeholder="Procurar tarefa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar tarefa" />
        </div>
        <Button icon={Plus} size="sm" onClick={() => setAdding(true)}>
          Tarefa
        </Button>
        {view === 'lista' && (
          <Button icon={selecting ? X : CheckSquare} size="sm" variant={selecting ? 'soft' : 'default'} onClick={() => (selecting ? exitSelect() : setSelecting(true))} title="Selecionar várias tarefas para mudar em bloco">
            {selecting ? 'Cancelar' : 'Selecionar'}
          </Button>
        )}
        <Segmented<ChecklistView>
          label="Vista"
          value={view}
          onChange={(v) => {
            setView(v);
            if (v === 'quadro') exitSelect();
          }}
          options={[
            { value: 'lista', label: <span className="sr-only">Lista</span>, icon: List },
            { value: 'quadro', label: <span className="sr-only">Quadro</span>, icon: KanbanSquare },
          ]}
        />
      </div>

      {selecting && (
        <div className="bulk-bar" role="region" aria-label="Ações em massa">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={visible.length > 0 && visible.every((t) => selected.has(t.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((t) => t.id)) : new Set())}
            />
            {selected.size ? `${selected.size} selecionada(s)` : 'Selecionar todas as visíveis'}
          </label>
          <span className="spacer" />
          <select
            className="select"
            aria-label="Mudar estado"
            value=""
            disabled={!selected.size}
            onChange={(e) => {
              const st = e.target.value as Status;
              if (st) void bulk(`estado → ${STATUSES.find((x) => x.id === st)?.label}`, () => bulkSetStatus(selectedTasks, st));
            }}
          >
            <option value="">Estado…</option>
            {STATUSES.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Atribuir responsável"
            value=""
            disabled={!selected.size}
            onChange={(e) => {
              const id = e.target.value;
              if (id === '__none') void bulk('sem responsável', () => bulkUpdateTasks(selectedTasks, { assigneeId: '' }, 'responsável removido'));
              else if (id) void bulk(`responsável → ${members.get(id)?.name ?? ''}`, () => bulkUpdateTasks(selectedTasks, { assigneeId: id }, `responsável → ${members.get(id)?.name ?? ''}`));
            }}
          >
            <option value="">Responsável…</option>
            {memberList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="__none">Sem responsável</option>
          </select>
          <input
            type="date"
            className="input"
            style={{ width: 150 }}
            aria-label="Definir prazo"
            disabled={!selected.size}
            onChange={(e) => {
              const d = e.target.value;
              if (d) void bulk(`prazo → ${d}`, () => bulkUpdateTasks(selectedTasks, { dueDate: d, dueSource: 'manual' }, `prazo → ${d}`));
            }}
          />
          <Button size="sm" disabled={!selected.size} onClick={() => void bulk('marcadas como críticas', () => bulkUpdateTasks(selectedTasks, { critical: true }, 'marcadas como críticas'))}>
            Crítica
          </Button>
          <Button size="sm" disabled={!selected.size} onClick={() => void bulk('deixam de ser críticas', () => bulkUpdateTasks(selectedTasks, { critical: false }, 'deixam de ser críticas'))}>
            Não crítica
          </Button>
          <Button
            size="sm"
            variant="danger-soft"
            icon={Trash2}
            disabled={!selectedTasks.some((t) => !t.ruleKey)}
            title="Só as tarefas próprias podem ser removidas; as geradas por regras marcam-se N/A"
            onClick={async () => {
              const manual = selectedTasks.filter((t) => !t.ruleKey);
              const ok = await confirm({ title: `Remover ${manual.length} tarefa(s) própria(s)?`, message: 'As tarefas geradas pelo questionário não são removidas — marque-as como “Não aplicável”.', confirmLabel: 'Remover' });
              if (ok) void bulk('removidas', () => deleteManualTasks(manual));
            }}
          >
            Remover
          </Button>
        </div>
      )}

      {view === 'quadro' ? (
        <ChecklistBoard tasks={boardTasks} members={members} onOpen={onOpen} />
      ) : visible.length === 0 ? (
        <Card>
          <Empty
            icon={ListChecks}
            title={filter === 'abertas' ? 'Nada em aberto' : 'Sem tarefas neste filtro'}
            text={filter === 'abertas' ? 'Todas as tarefas aplicáveis estão concluídas ou marcadas como N/A.' : 'Experimente outro filtro.'}
            action={
              filter !== 'todas' ? (
                <Button size="sm" onClick={() => onFilter('todas')}>
                  Ver todas
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        PHASES.map((p) => {
          const list = visible.filter((t) => t.phase === p.id);
          if (!list.length) return null;
          const all = tasks.filter((t) => t.phase === p.id && !t.obsolete);
          const done = all.filter((t) => t.status === 'concluido' || t.status === 'na').length;
          const Icon = PHASE_ICONS[p.id];
          const isCollapsed = collapsed.has(p.id);
          return (
            <Card key={p.id} className="phase-card">
              <button type="button" className="phase-head" aria-expanded={!isCollapsed} onClick={() => toggle(p.id)}>
                <span className="icon-tile brand" style={{ width: 32, height: 32 }}>
                  <Icon aria-hidden />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="phase-title">{p.label}</span>
                  <span className="phase-desc">{p.description}</span>
                </span>
                <span className="spacer" />
                <span className="phase-count tabular">
                  {done}/{all.length}
                </span>
                <span className="phase-mini">
                  <span style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
                </span>
                <ChevronDown className={cx('chev', isCollapsed && 'collapsed')} aria-hidden />
              </button>
              {!isCollapsed && (
                <ul className="task-list">
                  {list.map((t) => (
                    <TaskRow key={t.id} t={t} onOpen={onOpen} assignee={members.get(t.assigneeId)} selectable={selecting} selected={selected.has(t.id)} onSelect={() => toggleSelect(t.id)} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}

      <AddTaskSheet open={adding} caseId={c.id} onClose={() => setAdding(false)} />
    </div>
  );
}

function TaskRow({
  t,
  onOpen,
  assignee,
  selectable,
  selected,
  onSelect,
}: {
  t: TaskRecord;
  onOpen: (t: TaskRecord) => void;
  assignee?: MemberRecord;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const ds = dueState(t.dueDate, t.status);
  return (
    <li className={cx('task-row', `st-${t.status}`, ds === 'atrasado' && 'overdue', t.obsolete && 'obsolete', selected && 'selected')}>
      {selectable && (
        <label className="task-select">
          <input type="checkbox" checked={Boolean(selected)} onChange={onSelect} aria-label={`Selecionar “${t.title}”`} />
        </label>
      )}
      <div className="task-status">
        <StatusMenu status={t.status} onChange={(s) => void setTaskStatus(t, s)} compact />
      </div>
      <button type="button" className="task-main" onClick={() => onOpen(t)}>
        <span className="task-title">
          {t.critical && isOpen(t.status) && <TriangleAlert className="crit-icon" size={14} aria-label="Crítica" />}
          {t.title}
        </span>
        <span className="task-sub">
          {isOfficeKey(t.ruleKey) && <span className="badge brand">Escritório</span>}
          {t.obsolete ? (
            <span className="badge warn">Deixou de se aplicar — rever</span>
          ) : t.reason && !t.ruleKey ? (
            <span>{t.reason}</span>
          ) : t.reason ? (
            <span className="reason">
              <Lightbulb aria-hidden />
              {t.reason}
            </span>
          ) : null}
          {t.notes && <span className="note-hint">· tem notas</span>}
        </span>
      </button>
      <div className="task-meta">
        <DueChip date={t.dueDate} status={t.status} withRelative={false} />
        {assignee && <Avatar member={assignee} size="sm" />}
      </div>
    </li>
  );
}

function AddTaskSheet({ open, caseId, onClose }: { open: boolean; caseId: string; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<PhaseId>('abertura');
  const [dueDate, setDueDate] = useState('');
  const [critical, setCritical] = useState(false);
  const [description, setDescription] = useState('');

  const reset = () => {
    setTitle('');
    setDueDate('');
    setCritical(false);
    setDescription('');
  };

  const submit = async () => {
    if (!title.trim()) return;
    await addCustomTask(caseId, { title: title.trim(), phase, dueDate, critical, description });
    toast({ tone: 'success', title: 'Tarefa acrescentada' });
    reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Nova tarefa"
      subtitle="Tarefas específicas deste dossier, para além das geradas pelo questionário."
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!title.trim()}>
            Acrescentar
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Título *" htmlFor="nt-title">
          <input
            id="nt-title"
            className="input"
            value={title}
            data-autofocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
        <div className="form-grid">
          <Field label="Fase" htmlFor="nt-phase">
            <select id="nt-phase" className="select" value={phase} onChange={(e) => setPhase(e.target.value as PhaseId)}>
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo" htmlFor="nt-due">
            <input id="nt-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição" htmlFor="nt-desc">
          <textarea id="nt-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
          Tarefa crítica
        </label>
      </div>
    </Sheet>
  );
}
