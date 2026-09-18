import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowRight, Bookmark, CalendarClock, FileSpreadsheet, FolderOpen, KanbanSquare, LayoutGrid, List, Plus, Search, SlidersHorizontal, TriangleAlert, Upload, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EMPTY_FILTERS, applyFilters, buildDeepIndex, countActive, describeFilters, filtersFromSearch, filtersToSearch, type Filters, type HealthFilter } from '../../lib/views';
import { FiltersSheet, ViewsSheet } from './FilterSheets';
import { PHASES } from '../../engine/phases';
import { useMemberMap, useMembers, useOverviews, type CaseOverview } from '../../lib/hooks';
import type { MemberRecord } from '../../lib/types';
import { cx, formatDate, relativeDays } from '../../lib/utils';
import { phaseLabel } from '../../engine/phases';
import { Avatar, Button, Card, DueChip, Empty, HealthBadge, Progress, Segmented, StackedBar } from '../../components/ui';

type SortKey = 'recentes' | 'prazo' | 'progresso' | 'nome' | 'obito';

const PREF_KEY = 'bs-list-prefs';

type ListView = 'cards' | 'table' | 'quadro';
function loadPrefs(): { view: ListView; sort: SortKey } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
    return { view: p.view === 'table' ? 'table' : p.view === 'quadro' ? 'quadro' : 'cards', sort: p.sort ?? 'recentes' };
  } catch {
    return { view: 'cards', sort: 'recentes' };
  }
}

import { csvName, downloadCsv } from '../../lib/csv';
import { STAGE_LABELS, PRIORITY_LABELS } from '../../lib/labels';
const ImportDossierSheet = lazy(() => import('./ShareSheets').then((m) => ({ default: m.ImportDossierSheet })));

export function DossierList() {
  const overviews = useOverviews();
  const members = useMembers();
  const memberMap = useMemberMap();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [importing, setImporting] = useState(() => new URLSearchParams(search).get('importar') === '1');
  // Os filtros vivem no endereço (#/dossiers?prio=urgente&prazo=7d): partilháveis e guardáveis.
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const setFilters = (f: Filters) => {
    // O «?» é sempre enviado: sem ele, o wouter mantém a pesquisa anterior no endereço.
    navigate(`/dossiers?${filtersToSearch(f)}`, { replace: true });
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const activeCount = countActive(filters);
  const chips = describeFilters(filters, members);
  const deepIndex = useLiveQuery(async () => {
    if (!filters.deep) return undefined;
    const [notes, contacts, documents, parties, assets] = await Promise.all([db.notes.toArray(), db.contacts.toArray(), db.documents.toArray(), db.parties.toArray(), db.assets.toArray()]);
    return buildDeepIndex({ notes, contacts, documents, parties, assets });
  }, [filters.deep]);
  const tags = useMemo(() => [...new Set((overviews ?? []).flatMap((o) => o.c.tags))].sort((a, b) => a.localeCompare(b, 'pt')), [overviews]);
  const [prefs, setPrefs] = useState(loadPrefs);

  const savePrefs = (p: typeof prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(p));
    } catch {
      /* ignora */
    }
  };

  // A lista segue os filtros com prioridade baixa: a escrita na pesquisa nunca espera pela lista.
  const listFilters = useDeferredValue(filters);
  const filtered = useMemo(() => {
    const list = applyFilters(overviews ?? [], listFilters, deepIndex ? { deep: deepIndex } : {});
    const s = prefs.sort;
    return list.sort((a, b) => {
      if (s === 'nome') return a.c.name.localeCompare(b.c.name, 'pt');
      if (s === 'progresso') return a.stats.pct - b.stats.pct;
      if (s === 'obito') return (b.c.deceased.deathDate || '').localeCompare(a.c.deceased.deathDate || '');
      if (s === 'prazo') return (a.nextDeadline?.dueDate || '9999').localeCompare(b.nextDeadline?.dueDate || '9999');
      return b.c.updatedAt.localeCompare(a.c.updatedAt);
    });
  }, [overviews, listFilters, deepIndex, prefs.sort]);

  const base = (overviews ?? []).filter((o) => o.c.stage === 'ativo' || o.c.stage === 'suspenso');
  const counts = {
    todos: base.length,
    atencao: base.filter((o) => o.health.level === 'vermelho').length,
    andamento: base.filter((o) => o.health.level === 'laranja' || o.health.level === 'azul').length,
    concluidos: base.filter((o) => o.health.level === 'verde').length,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <FolderOpen size={14} aria-hidden /> Balcão das Sucessões
          </div>
          <h1>Dossiers</h1>
          <p className="lede">Sucessões em acompanhamento — estado, próxima ação e prazos de cada uma.</p>
        </div>
        <div className="page-actions">
          <Button
            icon={FileSpreadsheet}
            disabled={filtered.length === 0}
            title="Exportar a lista filtrada para Excel (CSV)"
            onClick={() =>
              downloadCsv(
                csvName('dossiers'),
                ['Referência', 'Dossier', 'De cujus', 'Óbito', 'Cliente', 'Responsável', 'Situação', 'Prioridade', 'Semáforo', 'Progresso %', 'Fase', 'Pendentes', 'Em curso', 'A aguardar', 'Concluídas', 'Prazos ultrapassados', 'Próximo prazo', 'Próxima ação', 'Etiquetas', 'Atualizado'],
                filtered.map((o) => [
                  o.c.ref,
                  o.c.name,
                  o.c.deceased.name,
                  o.c.deceased.deathDate,
                  o.c.client.name,
                  memberMap.get(o.c.responsibleId)?.name ?? '',
                  STAGE_LABELS[o.c.stage],
                  PRIORITY_LABELS[o.c.priority],
                  o.health.label,
                  o.stats.pct,
                  o.phase ? phaseLabel(o.phase) : '',
                  o.stats.byStatus.pendente,
                  o.stats.byStatus.em_curso,
                  o.stats.byStatus.aguarda,
                  o.stats.byStatus.concluido,
                  o.blockers.overdue.length,
                  o.nextDeadline?.dueDate ?? '',
                  o.next?.title ?? '',
                  o.c.tags.join(', '),
                  o.c.updatedAt.slice(0, 10),
                ]),
              )
            }
          >
            CSV
          </Button>
          <Button icon={Upload} title="Juntar um dossier partilhado por um colega" onClick={() => setImporting(true)}>
            Importar dossier
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => navigate('/dossiers/novo')}>
            Nova sucessão
          </Button>
        </div>
      </div>
      {importing && (
        <Suspense fallback={null}>
          <ImportDossierSheet
            open
            onClose={() => {
              setImporting(false);
              if (search.includes('importar=1')) setFilters(filters);
            }}
          />
        </Suspense>
      )}
      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        members={members}
        tags={tags}
        onSaveView={() => {
          setFiltersOpen(false);
          setViewsOpen(true);
        }}
      />
      <ViewsSheet open={viewsOpen} onClose={() => setViewsOpen(false)} filters={filters} onApply={setFilters} />

      <div className="toolbar list-toolbar">
        <div className="input-group" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <Search aria-hidden />
          <input
            className="input"
            placeholder={filters.deep ? 'Pesquisar em tudo: notas, contactos, documentos…' : 'Nome, referência, falecido, cliente, etiqueta…'}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            aria-label="Pesquisar dossiers"
          />
        </div>
        {filters.stage === 'abertos' && (
          <Segmented<HealthFilter>
            label="Filtrar por semáforo"
            value={filters.health}
            onChange={(health) => setFilters({ ...filters, health })}
            options={[
              { value: 'todos', label: 'Todos', count: counts.todos },
              { value: 'atencao', label: 'Atenção', count: counts.atencao },
              { value: 'andamento', label: 'Em andamento', count: counts.andamento },
              { value: 'concluidos', label: '100%', count: counts.concluidos },
            ]}
          />
        )}
        <Button icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)} aria-pressed={activeCount > 0} title="Filtros avançados">
          Filtros{activeCount ? ` (${activeCount})` : ''}
        </Button>
        <Button icon={Bookmark} onClick={() => setViewsOpen(true)} title="Vistas predefinidas e guardadas">
          Vistas
        </Button>
        <span className="spacer" />
        <select className="select" style={{ width: 'auto' }} aria-label="Ordenar" value={prefs.sort} onChange={(e) => savePrefs({ ...prefs, sort: e.target.value as SortKey })}>
          <option value="recentes">Atualizados recentemente</option>
          <option value="prazo">Prazo mais próximo</option>
          <option value="progresso">Menor progresso</option>
          <option value="obito">Óbito mais recente</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
        <Segmented<ListView>
          label="Vista"
          value={prefs.view}
          onChange={(view) => savePrefs({ ...prefs, view })}
          options={[
            { value: 'cards', label: <span className="sr-only">Cartões</span>, icon: LayoutGrid },
            { value: 'table', label: <span className="sr-only">Tabela</span>, icon: List },
            { value: 'quadro', label: <span className="sr-only">Quadro por fase</span>, icon: KanbanSquare },
          ]}
        />
      </div>
      {chips.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }} role="group" aria-label="Filtros ativos">
          {chips.map((ch) => (
            <button key={ch.key} type="button" className="chip on" title="Remover este filtro" onClick={() => setFilters({ ...filters, [ch.key]: EMPTY_FILTERS[ch.key] })}>
              {ch.label} <X size={12} aria-hidden />
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
            Limpar filtros
          </button>
        </div>
      )}

      {overviews === undefined ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : filtered.length === 0 ? (
        <Card>
          <Empty
            icon={FolderOpen}
            title={(overviews ?? []).length ? 'Nenhum dossier corresponde aos filtros' : 'Ainda não existem dossiers'}
            text={(overviews ?? []).length ? 'Ajuste a pesquisa ou os filtros.' : 'Comece o primeiro dossier para o ver aqui.'}
            action={
              <Button variant="primary" icon={Plus} onClick={() => navigate('/dossiers/novo')}>
                Nova sucessão
              </Button>
            }
          />
        </Card>
      ) : prefs.view === 'quadro' ? (
        <DossierBoard list={filtered} memberMap={memberMap} />
      ) : prefs.view === 'cards' ? (
        <div className="case-grid">
          {filtered.map((o) => (
            <CaseCard key={o.c.id} o={o} member={memberMap.get(o.c.responsibleId)} />
          ))}
        </div>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Estado</th>
                  <th>Fase</th>
                  <th>Progresso</th>
                  <th>Próximo prazo</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.c.id} className="clickable" onClick={() => navigate(`/dossiers/${o.c.id}`)}>
                    <td>
                      <div className="strong pv">{o.c.name}</div>
                      <div className="tiny subtle">
                        {o.c.ref} · <span className="pv">{o.c.deceased.name || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <HealthBadge health={o.health} />
                    </td>
                    <td className="small">{o.phase ? phaseLabel(o.phase) : '—'}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Progress pct={o.stats.pct} thin label={`Progresso de ${o.c.name}`} />
                        </div>
                        <span className="tabular small strong">{o.stats.pct}%</span>
                      </div>
                    </td>
                    <td>{o.nextDeadline ? <DueChip date={o.nextDeadline.dueDate} status={o.nextDeadline.status} withRelative={false} /> : <span className="subtle">—</span>}</td>
                    <td>
                      <Avatar member={memberMap.get(o.c.responsibleId)} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CaseCard({ o, member }: { o: CaseOverview; member?: MemberRecord }) {
  const { c, stats, health, next, nextDeadline } = o;
  return (
    <Link href={`/dossiers/${c.id}`} className={cx('card interactive case-card', `lvl-${health.level}`)}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tiny subtle strong">{c.ref}</div>
          <div className="case-card-title">{c.name}</div>
          <div className="small subtle truncate">
            <span className="pv">{c.deceased.name || 'De cujus por indicar'}</span>
            {c.deceased.deathDate ? ` · óbito ${relativeDays(c.deceased.deathDate)}` : ''}
          </div>
        </div>
        <Avatar member={member} />
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <HealthBadge health={health} />
        {c.priority === 'urgente' && <span className="badge critical">Urgente</span>}
        {c.priority === 'alta' && <span className="badge warn">Prioridade alta</span>}
        {c.tags.slice(0, 3).map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="small subtle">
            {stats.done}/{stats.applicable} concluídas{o.phase ? ` · ${phaseLabel(o.phase)}` : ''}
          </span>
          <span className="strong tabular">{stats.pct}%</span>
        </div>
        <StackedBar counts={stats.byStatus} />
      </div>
      <div className="case-card-next">
        {next ? (
          <>
            {next.critical ? <TriangleAlert size={14} className="crit-icon" aria-hidden /> : <ArrowRight size={14} aria-hidden />}
            <span className="truncate">{next.title}</span>
          </>
        ) : (
          <span className="subtle">Sem ações em aberto</span>
        )}
      </div>
      {nextDeadline && (
        <div className="row small" style={{ gap: 6 }}>
          <CalendarClock size={14} aria-hidden className="subtle" />
          <span className="truncate subtle">{nextDeadline.title}</span>
          <span className="spacer" />
          <DueChip date={nextDeadline.dueDate} status={nextDeadline.status} withRelative={false} />
        </div>
      )}
      <div className="tiny subtle">Atualizado em {formatDate(c.updatedAt.slice(0, 10))}</div>
    </Link>
  );
}


/** Quadro da carteira: uma coluna por fase atual (a primeira com trabalho em aberto). */
function DossierBoard({ list, memberMap }: { list: CaseOverview[]; memberMap: Map<string, MemberRecord> }) {
  const cols = [...PHASES.map((p) => ({ id: p.id as string, label: p.label })), { id: '__done', label: 'Sem trabalho em aberto' }];
  return (
    <div className="board dossier-board" role="list" aria-label="Dossiers por fase">
      {cols.map((col) => {
        const items = list.filter((o) => (o.phase ?? '__done') === col.id);
        if (!items.length && col.id !== '__done') return null;
        return (
          <div key={col.id} className="board-col" role="listitem" aria-label={`${col.label}: ${items.length}`}>
            <header className="board-head">
              <span className="board-title">{col.label}</span>
              <span className="board-count tabular">{items.length}</span>
            </header>
            <div className="board-cards">
              {items.length === 0 && <div className="board-empty">—</div>}
              {items.map((o) => {
                const m = memberMap.get(o.c.responsibleId);
                return (
                  <Link key={o.c.id} href={`/dossiers/${o.c.id}`} className={cx('board-card', o.blockers.overdue.length > 0 && 'overdue')}>
                    <span className="board-card-title">{o.c.name}</span>
                    <span className="board-card-phase">
                      {o.c.ref} · {o.stats.pct}%
                    </span>
                    {o.next && <span className="board-card-next">{o.next.title}</span>}
                    <span className="board-card-foot">
                      <HealthBadge health={o.health} />
                      <span className="spacer" />
                      {m && <Avatar member={m} size="sm" />}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
