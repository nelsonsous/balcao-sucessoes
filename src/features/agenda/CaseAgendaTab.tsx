import { useState } from 'react';
import { useLocation } from 'wouter';
import { CalendarDays, CalendarPlus, Download } from 'lucide-react';
import { exportIcs, groupByDate, icsFilename, useAgendaItems, useHolidayCalendar, type AgendaItem } from '../../lib/agenda';
import { newEvent } from '../../lib/db';
import { useMemberMap } from '../../lib/hooks';
import type { CaseRecord } from '../../lib/types';
import { cx, formatDate, relativeDays, todayIso } from '../../lib/utils';
import { weekdayLong } from '../../engine/calendar';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty } from '../../components/ui';
import { AgendaRow } from './AgendaPage';
import { EventSheet, type EventSheetState } from './EventSheet';

export function CaseAgendaTab({ c, onOpenTask }: { c: CaseRecord; onOpenTask: (taskId: string) => void }) {
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState<EventSheetState | null>(null);
  const items = useAgendaItems({ caseId: c.id, includeDone: showDone });
  const memberMap = useMemberMap();
  const holidays = useHolidayCalendar();
  const toast = useToast();
  const [, navigate] = useLocation();
  const today = todayIso();

  const open = (i: AgendaItem) => {
    if (i.source === 'evento' && i.event) setSheet({ event: i.event, isNew: false, lockCase: true });
    else if (i.source === 'prazo') onOpenTask(i.id);
    else navigate(`/dossiers/${c.id}/notas`);
  };

  const list = items ?? [];
  const past = list.filter((i) => i.date < today);
  const future = list.filter((i) => i.date >= today);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar">
        <div>
          <h2>Agenda do dossier</h2>
          <p className="subtle small">Prazos legais, escrituras, reuniões e contactos a retomar deste dossier.</p>
        </div>
        <span className="spacer" />
        <label className="checkbox small">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Mostrar concluídos
        </label>
        <Button
          icon={Download}
          disabled={!list.some((i) => !i.done)}
          onClick={() => {
            const n = exportIcs(list, `${c.ref} · ${c.name}`, icsFilename(`${c.ref}-${c.name}`));
            toast({ tone: 'success', title: `${n} item(ns) exportado(s)`, description: 'Importe o ficheiro .ics no seu calendário.' });
          }}
        >
          .ics
        </Button>
        <Button variant="primary" icon={CalendarPlus} onClick={() => setSheet({ event: newEvent({ caseId: c.id, date: today }), isNew: true, lockCase: true })}>
          Agendar
        </Button>
      </div>

      {items === undefined ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon={CalendarDays}
            title="Sem compromissos"
            text={c.deceased.deathDate ? 'Agende escrituras, reuniões e diligências deste dossier.' : 'Indique a data do óbito para que os prazos legais apareçam aqui.'}
          />
        </Card>
      ) : (
        <>
          {past.some((i) => !i.done) && (
            <Card className="agenda-group overdue-group">
              <CardHead title="Datas ultrapassadas" subtitle="Itens em aberto com data já passada" />
              <div className="card-body">
                {past
                  .filter((i) => !i.done)
                  .map((i) => (
                    <div key={i.key} className="agenda-with-date">
                      <span className="tiny subtle nowrap">{formatDate(i.date, 'daymonth')}</span>
                      <AgendaRow i={i} member={memberMap.get(i.assigneeId)} onOpen={open} showCase={false} />
                    </div>
                  ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHead icon={CalendarDays} title="Próximos" subtitle={`${future.length} item(ns)`} />
            <div className="card-body">
              {future.length === 0 ? (
                <p className="subtle small">Nada agendado.</p>
              ) : (
                <ol className="case-timeline">
                  {[...groupByDate(future).entries()].map(([date, day]) => {
                    const h = holidays.get(date);
                    return (
                      <li key={date} className={cx(date === today && 'is-today')}>
                        <div className="ct-date">
                          <strong>{formatDate(date, 'daymonth')}</strong>
                          <span className="ct-weekday">{weekdayLong(date)}</span>
                          <span className="tiny subtle">{relativeDays(date)}</span>
                          {h && <span className="tiny warn-text">{h.name}</span>}
                        </div>
                        <div className="ct-items">
                          {day.map((i) => (
                            <AgendaRow key={i.key} i={i} member={memberMap.get(i.assigneeId)} onOpen={open} showCase={false} />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {showDone && past.some((i) => i.done) && (
                <>
                  <div className="section-title" style={{ margin: '16px 0 6px' }}>
                    Concluídos
                  </div>
                  {past
                    .filter((i) => i.done)
                    .map((i) => (
                      <div key={i.key} className="agenda-with-date">
                        <span className="tiny subtle nowrap">{formatDate(i.date, 'daymonth')}</span>
                        <AgendaRow i={i} member={memberMap.get(i.assigneeId)} onOpen={open} showCase={false} />
                      </div>
                    ))}
                </>
              )}
            </div>
          </Card>
        </>
      )}
      <EventSheet state={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
