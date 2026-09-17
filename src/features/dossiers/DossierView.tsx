import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Globe,
  BookmarkPlus,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Copy,
  Ellipsis,
  FileText,
  FolderOpen,
  History,
  Landmark,
  ListChecks,
  NotebookPen,
  Pencil,
  Pin,
  Scale,
  Siren,
  Trash2,
  Users,
} from 'lucide-react';
import { duplicateCase, removeCase, updateCase } from '../../lib/actions';
import { db } from '../../lib/db';
import { buildOverview, useMemberMap } from '../../lib/hooks';
import type { CaseRecord, CaseStage, TaskRecord } from '../../lib/types';
import { cx, formatDate, relativeDays } from '../../lib/utils';
import { phaseLabel } from '../../engine/phases';
import { PHASE_ICONS } from '../../components/icons';
import { useToast } from '../../components/Toast';
import {
  Avatar,
  Button,
  Card,
  CardHead,
  DueChip,
  Empty,
  HealthBadge,
  KpiCard,
  Menu,
  Ring,
  Tabs,
  useConfirm,
} from '../../components/ui';
import { ActivityTab } from '../activity/ActivityTab';
import { AssetsTab } from '../assets/AssetsTab';
import { NotesTab } from '../notes/NotesTab';
import { PartiesTab } from '../parties/PartiesTab';
import { CaseEditSheet } from './CaseEditSheet';
import { ChecklistTab, type ChecklistFilter } from './ChecklistTab';
import { QuestionnaireTab } from './QuestionnaireTab';
import { TaskDrawer } from './TaskDrawer';
import { SaveTemplateSheet } from './SaveTemplateSheet';

// Separadores pesados (calculadora, documentos, internacional, agenda) e relatórios carregam à parte.
const CaseCalcTab = lazy(() => import('../calculator/CaseCalcTab').then((m) => ({ default: m.CaseCalcTab })));
const DocumentsTab = lazy(() => import('../documents/DocumentsTab').then((m) => ({ default: m.DocumentsTab })));
const InternationalTab = lazy(() => import('../international/InternationalTab').then((m) => ({ default: m.InternationalTab })));
const CaseAgendaTab = lazy(() => import('../agenda/CaseAgendaTab').then((m) => ({ default: m.CaseAgendaTab })));
const ReportSheet = lazy(() => import('../reports/ReportSheet').then((m) => ({ default: m.ReportSheet })));
const TabLoading = () => <div className="skeleton" style={{ height: 260 }} aria-busy="true" aria-label="A carregar" />;
import type { ReportKind } from '../../lib/reports';

type TabId = 'checklist' | 'interessados' | 'patrimonio' | 'documentos' | 'quotas' | 'internacional' | 'agenda' | 'notas' | 'questionario' | 'historico';

const STAGES: Array<{ id: CaseStage; label: string }> = [
  { id: 'ativo', label: 'Ativo' },
  { id: 'suspenso', label: 'Suspenso' },
  { id: 'concluido', label: 'Concluído' },
  { id: 'arquivado', label: 'Arquivado' },
];

const PRIORITY_LABEL = { normal: 'Prioridade normal', alta: 'Prioridade alta', urgente: 'Urgente' } as const;

export function DossierView() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, navigate] = useLocation();
  const id = params.id;
  const tab = (params.tab as TabId | undefined) ?? 'checklist';

  const data = useLiveQuery(async () => {
    const c = await db.cases.get(id);
    if (!c) return { c: null };
    const [tasks, parties, assets, notes, contacts, docsMissing] = await Promise.all([
      db.tasks.where('caseId').equals(id).toArray(),
      db.parties.where('caseId').equals(id).count(),
      db.assets.where('caseId').equals(id).count(),
      db.notes.where('caseId').equals(id).toArray(),
      db.contacts.where('caseId').equals(id).count(),
      db.documents.where('caseId').equals(id).filter((d) => d.status === 'em_falta' || d.status === 'pedido').count(),
    ]);
    return { c, tasks, parties, assets, notes, contacts, docsMissing };
  }, [id]);

  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChecklistFilter>('abertas');
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<ReportKind | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [allBlockers, setAllBlockers] = useState(false);
  const search = useSearch();
  useEffect(() => {
    const t = new URLSearchParams(search).get('tarefa');
    if (!t) return;
    setSelectedTask(t);
    history.replaceState(history.state, '', location.pathname + location.hash);
  }, [search]);
  const members = useMemberMap();
  const toast = useToast();
  const confirm = useConfirm();

  const overview = useMemo(() => (data?.c ? buildOverview(data.c, data.tasks ?? []) : null), [data]);

  if (data === undefined) return <div className="skeleton" style={{ height: 320 }} />;
  if (!data.c || !overview)
    return (
      <Card>
        <Empty
          icon={FolderOpen}
          title="Dossier não encontrado"
          text="Pode ter sido eliminado ou pertencer a outro dispositivo."
          action={<Button onClick={() => navigate('/dossiers')}>Ver dossiers</Button>}
        />
      </Card>
    );

  const c: CaseRecord = data.c;
  const tasks: TaskRecord[] = data.tasks ?? [];
  const { stats, health, next, blockers } = overview;
  const responsible = members.get(c.responsibleId);
  const pinned = (data.notes ?? []).filter((n) => n.pinned);
  const task = tasks.find((t) => t.id === selectedTask) ?? null;

  const setTab = (t: TabId) => navigate(t === 'checklist' ? `/dossiers/${id}` : `/dossiers/${id}/${t}`, { replace: true });
  const openTask = (t: TaskRecord) => {
    setSelectedTask(t.id);
  };
  const showFilter = (f: ChecklistFilter) => {
    setFilter(f);
    setTab('checklist');
  };

  async function onDelete() {
    const ok = await confirm({
      title: `Eliminar “${c.name}”?`,
      message: 'Serão eliminados a checklist, interessados, património, notas e histórico deste dossier. Esta ação não pode ser anulada — considere exportar uma cópia de segurança antes.',
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
    });
    if (!ok) return;
    await removeCase(c);
    toast({ title: 'Dossier eliminado', tone: 'success' });
    navigate('/dossiers');
  }

  const upcoming = tasks
    .filter((t) => !t.obsolete && t.dueDate && (t.status === 'pendente' || t.status === 'em_curso' || t.status === 'aguarda'))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);

  return (
    <div>
      <nav className="breadcrumb" aria-label="Localização">
        <Link href="/dossiers">Dossiers</Link>
        <ChevronRight aria-hidden />
        <span className="truncate">{c.ref}</span>
      </nav>

      <div className="case-head">
        <div className="case-head-main">
          <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
            <HealthBadge health={health} />
            {c.priority !== 'normal' && <span className={cx('badge', c.priority === 'urgente' ? 'critical' : 'warn')}>{PRIORITY_LABEL[c.priority]}</span>}
            {c.demo && <span className="badge outline">Demonstração</span>}
            {c.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
          <h1 className="pv">{c.name}</h1>
          <div className="case-meta">
            <span>
              <strong>{c.ref}</strong>
            </span>
            <span>
              De cujus: <span className="pv">{c.deceased.name || '—'}</span>
            </span>
            <span>
              Óbito: {c.deceased.deathDate ? `${formatDate(c.deceased.deathDate)} (${relativeDays(c.deceased.deathDate)})` : '—'}
            </span>
            {c.client.name && (
              <span>
                Cliente: <span className="pv">{c.client.name}</span>
              </span>
            )}
          </div>
        </div>
        <div className="case-head-side">
          <div className="row" title="Responsável">
            <Avatar member={responsible} />
            <div className="small">
              <div className="subtle tiny">Responsável</div>
              <div className="strong">{responsible?.name ?? 'Por atribuir'}</div>
            </div>
          </div>
          <select
            className="select"
            style={{ width: 'auto', height: 34 }}
            aria-label="Situação do dossier"
            value={c.stage}
            onChange={(e) => {
              const stage = e.target.value as CaseStage;
              void updateCase(c.id, { stage }, `Situação alterada para ${STAGES.find((s) => s.id === stage)?.label}`);
            }}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Button icon={FileText} onClick={() => setReport('interno')}>
            Relatório
          </Button>
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Menu
            ariaLabel="Mais ações"
            items={[
              {
                label: 'Duplicar como modelo',
                description: 'Copia dados e questionário',
                icon: Copy,
                onSelect: async () => {
                  const copy = await duplicateCase(c);
                  toast({ tone: 'success', title: 'Dossier duplicado', description: copy.ref });
                  navigate(`/dossiers/${copy.id}`);
                },
              },
              { label: 'Guardar como modelo', description: 'Questionário e tarefas próprias', icon: BookmarkPlus, onSelect: () => setSavingTemplate(true) },
              { label: 'Eliminar dossier', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => void onDelete() },
            ]}
            button={(p) => (
              <button type="button" className="btn icon" {...p}>
                <Ellipsis aria-hidden />
              </button>
            )}
          />
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi progress-kpi">
          <Ring pct={stats.pct} size={62} />
          <div>
            <div className="kpi-label">Estado do dossier</div>
            <div className="strong" style={{ fontSize: 15, marginTop: 2 }}>
              {stats.done} de {stats.applicable} concluídas
            </div>
            <div className="tiny subtle">{overview.phase ? `Fase atual: ${phaseLabel(overview.phase)}` : 'Sem trabalho em aberto'}</div>
          </div>
        </div>
        <KpiCard label="Pendentes" value={stats.byStatus.pendente} tone="red" onClick={() => showFilter('pendente')} pressed={filter === 'pendente' && tab === 'checklist'} />
        <KpiCard label="Em curso" value={stats.byStatus.em_curso} tone="orange" onClick={() => showFilter('em_curso')} pressed={filter === 'em_curso' && tab === 'checklist'} />
        <KpiCard label="A aguardar" value={stats.byStatus.aguarda} tone="blue" onClick={() => showFilter('aguarda')} pressed={filter === 'aguarda' && tab === 'checklist'} />
        <KpiCard label="Concluídas" value={stats.byStatus.concluido} tone="green" onClick={() => showFilter('concluido')} pressed={filter === 'concluido' && tab === 'checklist'} />
        <KpiCard label="N/A" value={stats.byStatus.na} tone="grey" onClick={() => showFilter('na')} pressed={filter === 'na' && tab === 'checklist'} />
      </div>

      <div className="case-layout">
        <div className="stack case-main" style={{ minWidth: 0, gap: 16 }}>
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            items={[
              { id: 'checklist', label: 'Checklist', icon: ListChecks, count: stats.open },
              { id: 'interessados', label: 'Interessados', icon: Users, count: data.parties },
              { id: 'patrimonio', label: 'Património', icon: Landmark, count: data.assets },
              { id: 'documentos', label: 'Documentos', icon: FileText, count: data.docsMissing },
              { id: 'quotas', label: 'Quotas', icon: Scale },
              { id: 'internacional', label: 'Internacional', icon: Globe },
              { id: 'agenda', label: 'Agenda', icon: CalendarDays },
              { id: 'notas', label: 'Notas & contactos', icon: NotebookPen, count: (data.notes?.length ?? 0) + (data.contacts ?? 0) },
              { id: 'questionario', label: 'Questionário', icon: ClipboardList },
              { id: 'historico', label: 'Histórico', icon: History },
            ]}
          />
          {tab === 'checklist' && <ChecklistTab c={c} tasks={tasks} filter={filter} onFilter={setFilter} onOpen={openTask} />}
          {tab === 'interessados' && <PartiesTab c={c} />}
          {tab === 'patrimonio' && <AssetsTab c={c} />}
          <Suspense fallback={<TabLoading />}>
            {tab === 'documentos' && <DocumentsTab c={c} />}
            {tab === 'quotas' && <CaseCalcTab c={c} />}
            {tab === 'internacional' && <InternationalTab c={c} />}
            {tab === 'agenda' && <CaseAgendaTab c={c} onOpenTask={setSelectedTask} />}
          </Suspense>
          {tab === 'notas' && <NotesTab c={c} />}
          {tab === 'questionario' && <QuestionnaireTab c={c} />}
          {tab === 'historico' && <ActivityTab caseId={c.id} />}
        </div>

        <aside className="stack case-aside" style={{ gap: 16 }}>
          <Card className="next-card">
            <div className="card-body" style={{ paddingTop: 18 }}>
              <div className="section-title">
                <ArrowRight size={14} aria-hidden /> Próxima ação
              </div>
              {next ? (
                <>
                  <button type="button" className="next-title" onClick={() => openTask(next)}>
                    {next.title}
                  </button>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge">
                      {(() => {
                        const Icon = PHASE_ICONS[next.phase];
                        return <Icon aria-hidden />;
                      })()}
                      {phaseLabel(next.phase)}
                    </span>
                    {next.critical && <span className="badge critical">Crítica</span>}
                    <DueChip date={next.dueDate} status={next.status} withRelative={false} />
                  </div>
                  <Button variant="primary" size="sm" iconRight={ArrowRight} onClick={() => openTask(next)} style={{ marginTop: 12 }}>
                    Abrir tarefa
                  </Button>
                </>
              ) : (
                <div className="row" style={{ marginTop: 10 }}>
                  <CircleCheck size={18} color="var(--st-concluido)" aria-hidden /> Tudo concluído 🎉
                </div>
              )}
            </div>
          </Card>

          <Card className={cx('blocker-card', blockers.count > 0 && 'has-blockers')}>
            <CardHead
              icon={Siren}
              title="O que está a bloquear?"
              subtitle={blockers.count ? `${blockers.count} ponto(s) a acompanhar` : 'Nenhum bloqueio identificado'}
            />
            <div className="card-body">
              {blockers.count === 0 ? (
                <p className="subtle small">Sem prazos ultrapassados nem tarefas críticas por iniciar. 🎉</p>
              ) : (
                <div className="list">
                  {[
                    ...blockers.overdue.map((t) => ({ t, kind: 'Prazo ultrapassado', tone: 'red' as const })),
                    ...blockers.criticalPending.map((t) => ({ t, kind: 'Crítica por iniciar', tone: 'red' as const })),
                    ...blockers.awaiting.map((t) => ({ t, kind: 'A aguardar terceiros', tone: 'blue' as const })),
                  ]
                    .slice(0, allBlockers ? undefined : 5)
                    .map(({ t, kind, tone }) => (
                      <BlockerItem key={t.id} t={t} kind={kind} tone={tone} onOpen={openTask} />
                    ))}
                </div>
              )}
              {blockers.count > 5 && (
                <button type="button" className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => setAllBlockers((v) => !v)}>
                  {allBlockers ? 'Mostrar menos' : `Ver mais ${blockers.count - 5}`}
                </button>
              )}
              {blockers.obsolete.length > 0 && (
                <button type="button" className="btn soft sm block" style={{ marginTop: 10 }} onClick={() => showFilter('rever')}>
                  {blockers.obsolete.length} tarefa(s) para rever após alteração do questionário
                </button>
              )}
            </div>
          </Card>

          <Card>
            <CardHead icon={CalendarClock} title="Prazos" subtitle={c.deceased.deathDate ? 'Calculados a partir da data do óbito' : 'Indique a data do óbito para calcular'} />
            <div className="card-body">
              {upcoming.length === 0 ? (
                <p className="subtle small">Sem prazos em aberto.</p>
              ) : (
                <div className="list">
                  {upcoming.map((t) => (
                    <button key={t.id} type="button" className="list-item" onClick={() => openTask(t)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="li-title truncate">{t.title}</div>
                        <div className="li-sub">{formatDate(t.dueDate, 'long')}</div>
                      </div>
                      <DueChip date={t.dueDate} status={t.status} withRelative={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {pinned.length > 0 && (
            <Card>
              <CardHead icon={Pin} title="Notas importantes" />
              <div className="card-body">
                <ul className="pinned-list">
                  {pinned.map((n) => (
                    <li key={n.id}>{n.text}</li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" onClick={() => setTab('notas')}>
                  Ver notas & contactos
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <TaskDrawer task={task} caseRecord={c} onClose={() => setSelectedTask(null)} />
      {report && (
        <Suspense fallback={null}>
          <ReportSheet c={c} kind={report} onClose={() => setReport(null)} onKind={setReport} />
        </Suspense>
      )}
      <SaveTemplateSheet c={c} tasks={tasks} open={savingTemplate} onClose={() => setSavingTemplate(false)} />
      <CaseEditSheet open={editing} c={c} onClose={() => setEditing(false)} />
    </div>
  );
}

function BlockerItem({ t, kind, tone, onOpen }: { t: TaskRecord; kind: string; tone: 'red' | 'blue'; onOpen: (t: TaskRecord) => void }) {
  const Icon = PHASE_ICONS[t.phase];
  return (
    <button type="button" className="list-item" onClick={() => onOpen(t)}>
      <span className={cx('icon-tile', tone)} style={{ width: 30, height: 30 }}>
        <Icon aria-hidden />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="li-title" style={{ fontSize: 13 }}>
          {t.title}
        </div>
        <div className="li-sub">
          {kind}
          {t.dueDate ? ` · ${formatDate(t.dueDate)}` : ''}
        </div>
      </div>
    </button>
  );
}
