import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Gavel,
  List,
  MapPin,
  MessageSquare,
  PartyPopper,
  TriangleAlert,
} from 'lucide-react';
import {
  EVENT_KIND_LABELS,
  exportIcs,
  groupByDate,
  icsFilename,
  useAgendaItems,
  useHolidayCalendar,
  type AgendaItem,
  type AgendaSource,
} from '../../lib/agenda';
import { setEventDone } from '../../lib/actions';
import { newEvent, useSettings } from '../../lib/db';
import type { MemberRecord } from '../../lib/types';
import { useMemberMap, useMembers } from '../../lib/hooks';
import { cx, daysFromToday, formatDate, parseIsoDate, relativeDays, todayIso } from '../../lib/utils';
import { MONTHS_LONG, WEEKDAYS_SHORT, addDaysIso, judicialHoliday, monthMatrix, weekdayLong } from '../../engine/calendar';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, Empty, Menu, Segmented } from '../../components/ui';
import { EventSheet, type EventSheetState } from './EventSheet';

type View = 'mes' | 'lista';
type Filter = 'tudo' | AgendaSource;

const VIEW_KEY = 'bs-agenda-view';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'mes';
  } catch {
    return 'mes';
  }
}

export function AgendaPage() {
  const today = todayIso();
  const [, navigate] = useLocation();
  const toast = useToast();
  const settings = useSettings();
  const holidays = useHolidayCalendar();
  const members = useMembers();
  const memberMap = useMemberMap();
  const [view, setViewState] = useState<View>(loadView);
  const [cursor, setCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<Filter>('tudo');
  const [who, setWho] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState<EventSheetState | null>(null);

  const search = useSearch();
  useEffect(() => {
    const dia = new URLSearchParams(search).get('dia');
    if (!dia || !parseIsoDate(dia)) return;
    setSelected(dia);
    setCursor({ y: Number(dia.slice(0, 4)), m: Number(dia.slice(5, 7)) - 1 });
    setViewState('mes');
    history.replaceState(history.state, '', location.pathname + location.hash);
  }, [search]);

  const all = useAgendaItems({ includeDone: showDone });
  const items = useMemo(
    () => (all ?? []).filter((i) => (filter === 'tudo' || i.source === filter) && (!who || i.assigneeId === who)),
    [all, filter, who],
  );
  const byDate = useMemo(() => groupByDate(items), [items]);
  const weeks = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignora */
    }
  };
  const shiftMonth = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => {
    setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() });
    setSelected(today);
  };

  const openItem = (i: AgendaItem) => {
    if (i.source === 'evento' && i.event) setSheet({ event: i.event, isNew: false });
    else if (i.source === 'prazo') navigate(`/dossiers/${i.caseId}?tarefa=${i.id}`);
    else navigate(`/dossiers/${i.caseId}/notas`);
  };
  const newAt = (date: string) => setSheet({ event: newEvent({ date }), isNew: true });

  const doExport = (list: AgendaItem[], label: string) => {
    const n = exportIcs(list, `Balcão das Sucessões — ${label}`, icsFilename(`balcao-${label}`));
    toast({ tone: 'success', title: `${n} item(ns) exportado(s) para .ics`, description: 'Abra o ficheiro para o importar no Outlook, Google ou Apple Calendar.' });
  };

  const monthStart = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-01`;
  const monthEnd = todayIso(new Date(cursor.y, cursor.m + 1, 0, 12));
  const overdue = items.filter((i) => !i.done && i.date < today);
  const selectedItems = byDate.get(selected) ?? [];
  const selHoliday = holidays.get(selected);
  const selJudicial = settings.showJudicialHolidays ? judicialHoliday(selected) : undefined;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <CalendarDays size={14} aria-hidden /> Prazos e compromissos
          </div>
          <h1>Agenda</h1>
          <p className="lede">Prazos legais, escrituras, reuniões e contactos a retomar — com feriados e férias judiciais.</p>
        </div>
        <div className="page-actions">
          <Menu
            ariaLabel="Exportar agenda"
            items={[
              {
                label: 'Próximos 90 dias',
                description: 'Prazos, eventos e contactos em aberto',
                icon: Download,
                onSelect: () => doExport(items.filter((i) => i.date >= today && i.date <= addDaysIso(today, 90)), 'proximos-90-dias'),
              },
              {
                label: `${MONTHS_LONG[cursor.m]} de ${cursor.y}`,
                description: 'Só o mês visível',
                icon: Download,
                onSelect: () => doExport(items.filter((i) => i.date >= monthStart && i.date <= monthEnd), `${MONTHS_LONG[cursor.m]}-${cursor.y}`),
              },
              {
                label: 'Tudo o que está em aberto',
                description: 'Inclui prazos já ultrapassados',
                icon: Download,
                onSelect: () => doExport(items, 'em-aberto'),
              },
            ]}
            button={(p) => (
              <button type="button" className="btn" {...p}>
                <Download aria-hidden /> Exportar .ics
              </button>
            )}
          />
          <Button variant="primary" icon={CalendarPlus} onClick={() => newAt(selected >= today ? selected : today)}>
            Novo evento
          </Button>
        </div>
      </div>

      <div className="toolbar agenda-toolbar">
        {view === 'mes' && (
          <div className="row" style={{ gap: 6 }}>
            <Button iconOnly icon={ChevronLeft} aria-label="Mês anterior" onClick={() => shiftMonth(-1)} />
            <Button onClick={goToday}>Hoje</Button>
            <Button iconOnly icon={ChevronRight} aria-label="Mês seguinte" onClick={() => shiftMonth(1)} />
            <h2 className="month-title">
              {MONTHS_LONG[cursor.m]} <span className="subtle">{cursor.y}</span>
            </h2>
          </div>
        )}
        <span className="spacer" />
        <Segmented<Filter>
          label="Tipo"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'tudo', label: 'Tudo' },
            { value: 'prazo', label: 'Prazos' },
            { value: 'evento', label: 'Eventos' },
            { value: 'contacto', label: 'Contactos' },
          ]}
        />
        {members.length > 0 && (
          <select className="select" style={{ width: 'auto', height: 34 }} aria-label="Responsável" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Toda a equipa</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <label className="checkbox small">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Concluídos
        </label>
        <Segmented<View>
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: 'mes', label: 'Mês', icon: CalendarDays },
            { value: 'lista', label: 'Lista', icon: List },
          ]}
        />
      </div>

      {overdue.length > 0 && (
        <div className="callout danger" style={{ marginBottom: 14 }}>
          <TriangleAlert aria-hidden />
          <div>
            <strong>{overdue.length} item(ns) com data ultrapassada.</strong>{' '}
            <button type="button" className="link-btn" onClick={() => setView('lista')}>
              Ver na lista
            </button>
          </div>
        </div>
      )}

      {all === undefined ? (
        <div className="skeleton" style={{ height: 480 }} />
      ) : view === 'mes' ? (
        <div className="agenda-layout">
          <Card className="cal-card">
            <div className="cal" role="grid" aria-label={`${MONTHS_LONG[cursor.m]} de ${cursor.y}`}>
              <div className="cal-head" role="row">
                {WEEKDAYS_SHORT.map((w, i) => (
                  <div key={w} role="columnheader" className={cx(i >= 5 && 'weekend')}>
                    {w}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div className="cal-week" role="row" key={week[0]}>
                  {week.map((d) => {
                    const dayItems = byDate.get(d) ?? [];
                    const inMonth = Number(d.slice(5, 7)) - 1 === cursor.m;
                    const h = holidays.get(d);
                    const jud = settings.showJudicialHolidays ? judicialHoliday(d) : undefined;
                    const wd = parseIsoDate(d)!.getDay();
                    return (
                      <div
                        key={d}
                        role="gridcell"
                        tabIndex={0}
                        aria-selected={d === selected}
                        aria-label={`${weekdayLong(d)}, ${formatDate(d, 'long')}${h ? `, ${h.name}` : ''}${dayItems.length ? `, ${dayItems.length} item(ns)` : ''}`}
                        className={cx(
                          'cal-day',
                          !inMonth && 'out',
                          d === today && 'today',
                          d === selected && 'selected',
                          (wd === 0 || wd === 6) && 'weekend',
                          h && h.kind !== 'facultativo' && 'holiday',
                          jud && 'judicial',
                        )}
                        title={[h?.name, jud?.name].filter(Boolean).join(' · ') || undefined}
                        onClick={() => setSelected(d)}
                        onDoubleClick={() => newAt(d)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setSelected(d);
                        }}
                      >
                        <div className="cal-day-top">
                          <span className="cal-num">{Number(d.slice(8))}</span>
                          {h && <span className={cx('cal-holiday', h.kind)}>{h.name}</span>}
                        </div>
                        <div className="cal-items">
                          {dayItems.slice(0, 3).map((i) => (
                            <button
                              key={i.key}
                              type="button"
                              className={cx('cal-chip', `src-${i.source}`, i.source !== 'evento' && `st-${i.state}`, i.done && 'done')}
                              onClick={(e) => {
                                e.stopPropagation();
                                openItem(i);
                              }}
                              title={`${i.time ? `${i.time} · ` : ''}${i.title}${i.caseName ? ` — ${i.caseName}` : ''}`}
                            >
                              {i.time && <b>{i.time}</b>}
                              <span>{i.title}</span>
                            </button>
                          ))}
                          {dayItems.length > 3 && <span className="cal-more">+{dayItems.length - 3}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="cal-legend">
              <span>
                <i className="lg prazo" /> Prazo
              </span>
              <span>
                <i className="lg evento" /> Evento
              </span>
              <span>
                <i className="lg contacto" /> Contacto
              </span>
              <span>
                <i className="lg feriado" /> Feriado
              </span>
              {settings.showJudicialHolidays && (
                <span>
                  <i className="lg judicial" /> Férias judiciais
                </span>
              )}
              <span className="subtle">Duplo clique num dia para agendar</span>
            </div>
          </Card>

          <Card className="day-panel">
            <div className="card-body" style={{ paddingTop: 18 }}>
              <div className="section-title">{weekdayLong(selected)}</div>
              <h2 className="day-title">{formatDate(selected, 'long')}</h2>
              <div className="tiny subtle">{relativeDays(selected)}</div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {selHoliday && (
                  <span className={cx('badge', selHoliday.kind === 'facultativo' ? 'warn' : 'critical')}>
                    <PartyPopper aria-hidden /> {selHoliday.name}
                    {selHoliday.kind !== 'nacional' ? ` (${selHoliday.kind})` : ''}
                  </span>
                )}
                {selJudicial && (
                  <span className="badge info">
                    <Gavel aria-hidden /> {selJudicial.name}
                  </span>
                )}
                {!holidays.isBusinessDay(selected) && !selHoliday && <span className="badge">Fim de semana</span>}
              </div>
              <div className="day-items">
                {selectedItems.length === 0 ? (
                  <p className="subtle small">Nada agendado para este dia.</p>
                ) : (
                  selectedItems.map((i) => (
                    <AgendaRow key={i.key} i={i} member={memberMap.get(i.assigneeId)} onOpen={openItem} />
                  ))
                )}
              </div>
              <Button icon={CalendarPlus} block onClick={() => newAt(selected)} style={{ marginTop: 12 }}>
                Agendar neste dia
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <AgendaList items={items} today={today} holidays={holidays} memberMap={memberMap} onOpen={openItem} />
      )}

      <EventSheet state={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

export function AgendaRow({
  i,
  member,
  onOpen,
  showCase = true,
}: {
  i: AgendaItem;
  member?: MemberRecord;
  onOpen: (i: AgendaItem) => void;
  showCase?: boolean;
}) {
  const Icon = i.source === 'prazo' ? TriangleAlert : i.source === 'evento' ? CalendarDays : MessageSquare;
  return (
    <div className={cx('agenda-row', `src-${i.source}`, i.done && 'done', i.source !== 'evento' && `st-${i.state}`)}>
      <span className="agenda-time">{i.time || <Icon aria-hidden size={15} />}</span>
      <button type="button" className="agenda-main" onClick={() => onOpen(i)}>
        <span className="agenda-title">{i.title}</span>
        <span className="agenda-sub">
          {i.source === 'evento' ? EVENT_KIND_LABELS[i.eventKind!] : i.source === 'prazo' ? `Prazo · ${i.subtitle}` : 'Contacto a retomar'}
          {showCase && i.caseName ? <> · <span className="pv">{i.caseName}</span></> : ''}
          {i.endTime ? ` · até ${i.endTime}` : ''}
        </span>
        {i.location && (
          <span className="agenda-sub">
            <MapPin size={12} aria-hidden /> {i.location}
          </span>
        )}
      </button>
      {member && <Avatar member={member} size="sm" />}
      {i.source === 'evento' && i.event && (
        <input
          type="checkbox"
          className="agenda-check"
          checked={i.done}
          aria-label={i.done ? 'Marcar como por realizar' : 'Marcar como realizado'}
          onChange={(e) => void setEventDone(i.event!, e.target.checked)}
        />
      )}
    </div>
  );
}

function AgendaList({
  items,
  today,
  holidays,
  memberMap,
  onOpen,
}: {
  items: AgendaItem[];
  today: string;
  holidays: ReturnType<typeof useHolidayCalendar>;
  memberMap: ReturnType<typeof useMemberMap>;
  onOpen: (i: AgendaItem) => void;
}) {
  const [horizon, setHorizon] = useState(60);
  const limit = addDaysIso(today, horizon);
  const overdue = items.filter((i) => i.date < today && !i.done);
  const upcoming = items.filter((i) => i.date >= today && i.date <= limit);
  const groups = [...groupByDate(upcoming).entries()];

  if (!overdue.length && !groups.length)
    return (
      <Card>
        <Empty icon={CalendarDays} title="Agenda limpa" text={`Sem prazos, eventos ou contactos nos próximos ${horizon} dias.`} />
      </Card>
    );

  return (
    <div className="stack" style={{ gap: 14 }}>
      {overdue.length > 0 && (
        <Card className="agenda-group overdue-group">
          <div className="agenda-date">
            <TriangleAlert size={16} aria-hidden />
            <strong>Ultrapassados</strong>
            <span className="subtle small">{overdue.length} item(ns)</span>
          </div>
          {overdue.map((i) => (
            <div key={i.key} className="agenda-with-date">
              <span className="tiny subtle nowrap">{formatDate(i.date, 'daymonth')}</span>
              <AgendaRow i={i} member={memberMap.get(i.assigneeId)} onOpen={onOpen} />
            </div>
          ))}
        </Card>
      )}
      {groups.map(([date, list]) => {
        const n = daysFromToday(date) ?? 0;
        const h = holidays.get(date);
        return (
          <Card key={date} className={cx('agenda-group', date === today && 'is-today')}>
            <div className="agenda-date">
              <Clock size={15} aria-hidden />
              <strong>{n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : weekdayLong(date)}</strong>
              <span className="subtle small">{formatDate(date, 'long')}</span>
              {h && <span className={cx('badge', h.kind === 'facultativo' ? 'warn' : 'critical')}>{h.name}</span>}
            </div>
            {list.map((i) => (
              <AgendaRow key={i.key} i={i} member={memberMap.get(i.assigneeId)} onOpen={onOpen} />
            ))}
          </Card>
        );
      })}
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button variant="ghost" onClick={() => setHorizon((h) => h + 90)}>
          Mostrar mais 90 dias
        </Button>
      </div>
    </div>
  );
}
