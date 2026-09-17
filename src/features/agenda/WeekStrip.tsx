import { Link } from 'wouter';
import { groupByDate, useAgendaItems, useHolidayCalendar } from '../../lib/agenda';
import { cx, parseIsoDate, todayIso } from '../../lib/utils';
import { WEEKDAYS_SHORT, addDaysIso } from '../../engine/calendar';

/** Faixa dos próximos 7 dias para o painel. */
export function WeekStrip() {
  const items = useAgendaItems();
  const holidays = useHolidayCalendar();
  const today = todayIso();
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i));
  const byDate = groupByDate((items ?? []).filter((i) => i.date >= today && i.date <= days[6]!));
  const overdue = (items ?? []).filter((i) => i.date < today && !i.done).length;

  return (
    <div className="week-strip" aria-label="Próximos 7 dias">
      {overdue > 0 && (
        <Link href="/agenda" className="week-day overdue">
          <span className="wd">atraso</span>
          <span className="dn">{overdue}</span>
          <span className="wc">ultrapassado{overdue === 1 ? '' : 's'}</span>
        </Link>
      )}
      {days.map((d) => {
        const list = byDate.get(d) ?? [];
        const h = holidays.get(d);
        const wd = (parseIsoDate(d)!.getDay() + 6) % 7;
        const prazos = list.filter((i) => i.source === 'prazo').length;
        const eventos = list.filter((i) => i.source === 'evento').length;
        const contactos = list.filter((i) => i.source === 'contacto').length;
        return (
          <Link
            key={d}
            href={`/agenda?dia=${d}`}
            className={cx('week-day', d === today && 'today', wd >= 5 && 'weekend', h && h.kind !== 'facultativo' && 'holiday')}
            title={[h?.name, list.map((i) => `${i.time ? `${i.time} ` : ''}${i.title}`).join('\n')].filter(Boolean).join('\n')}
          >
            <span className="wd">{d === today ? 'hoje' : WEEKDAYS_SHORT[wd]}</span>
            <span className="dn">{Number(d.slice(8))}</span>
            <span className="wc">
              {prazos > 0 && <i className="pip prazo" aria-label={`${prazos} prazo(s)`} />}
              {eventos > 0 && <i className="pip evento" aria-label={`${eventos} evento(s)`} />}
              {contactos > 0 && <i className="pip contacto" aria-label={`${contactos} contacto(s)`} />}
              {list.length === 0 && (h ? <span className="hol">{h.name}</span> : <span className="none">—</span>)}
              {list.length > 0 && <b>{list.length}</b>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
