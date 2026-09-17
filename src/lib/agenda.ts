// Agenda unificada: prazos das tarefas, eventos e lembretes de contacto.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HolidayCalendar, resolveMunicipal } from '../engine/calendar';
import { dueState, type DueState } from '../engine/deadlines';
import { isOpen, phaseLabel } from '../engine/phases';
import { db, useSettings } from './db';
import { buildIcs, type IcsEvent } from './ics';
import type { EventKind, EventRecord, Status } from './types';
import { downloadFile, todayIso } from './utils';

export type AgendaSource = 'prazo' | 'evento' | 'contacto';

export interface AgendaItem {
  key: string;
  source: AgendaSource;
  id: string;
  date: string;
  time: string;
  endTime: string;
  title: string;
  subtitle: string;
  caseId: string;
  caseName: string;
  assigneeId: string;
  done: boolean;
  state: DueState;
  critical: boolean;
  status?: Status;
  eventKind?: EventKind;
  location?: string;
  notes?: string;
  event?: EventRecord;
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  reuniao: 'Reunião',
  escritura: 'Escritura / partilha',
  prazo: 'Prazo',
  diligencia: 'Diligência',
  lembrete: 'Lembrete',
  outro: 'Outro',
};

const byDateTime = (a: AgendaItem, b: AgendaItem) =>
  a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'pt');

/**
 * Todos os itens de agenda, em tempo real.
 * @param caseId limita a um dossier (opcional)
 * @param includeDone inclui tarefas concluídas / eventos feitos
 */
export function useAgendaItems(opts: { caseId?: string; includeDone?: boolean } = {}): AgendaItem[] | undefined {
  const { caseId, includeDone = false } = opts;
  const data = useLiveQuery(async () => {
    const [cases, tasks, events, contacts] = await Promise.all([
      caseId ? db.cases.where('id').equals(caseId).toArray() : db.cases.toArray(),
      caseId ? db.tasks.where('caseId').equals(caseId).toArray() : db.tasks.where('dueDate').above('').toArray(),
      caseId ? db.events.where('caseId').equals(caseId).toArray() : db.events.toArray(),
      caseId ? db.contacts.where('caseId').equals(caseId).toArray() : db.contacts.where('followUp').above('').toArray(),
    ]);
    return { cases, tasks, events, contacts };
  }, [caseId]);

  return useMemo(() => {
    if (!data) return undefined;
    const caseById = new Map(data.cases.map((c) => [c.id, c]));
    const liveCase = (id: string) => {
      const c = caseById.get(id);
      return c && (c.stage === 'ativo' || c.stage === 'suspenso');
    };
    const out: AgendaItem[] = [];

    for (const t of data.tasks) {
      if (!t.dueDate || t.obsolete) continue;
      if (!caseId && !liveCase(t.caseId)) continue;
      const open = isOpen(t.status);
      if (!open && !includeDone) continue;
      const c = caseById.get(t.caseId);
      out.push({
        key: `t-${t.id}`,
        source: 'prazo',
        id: t.id,
        date: t.dueDate,
        time: '',
        endTime: '',
        title: t.title,
        subtitle: phaseLabel(t.phase),
        caseId: t.caseId,
        caseName: c?.name ?? '',
        assigneeId: t.assigneeId || c?.responsibleId || '',
        done: !open,
        state: dueState(t.dueDate, t.status),
        critical: t.critical,
        status: t.status,
        notes: t.dueLabel,
      });
    }

    for (const e of data.events) {
      if (!e.date) continue;
      if (e.caseId && !caseId && !caseById.has(e.caseId)) continue;
      if (e.done && !includeDone) continue;
      const c = caseById.get(e.caseId);
      out.push({
        key: `e-${e.id}`,
        source: 'evento',
        id: e.id,
        date: e.date,
        time: e.time,
        endTime: e.endTime,
        title: e.title || EVENT_KIND_LABELS[e.kind],
        subtitle: EVENT_KIND_LABELS[e.kind],
        caseId: e.caseId,
        caseName: c?.name ?? '',
        assigneeId: e.assigneeId || c?.responsibleId || '',
        done: e.done,
        state: dueState(e.date, e.done ? 'concluido' : 'pendente'),
        critical: e.kind === 'prazo' || e.kind === 'escritura',
        eventKind: e.kind,
        location: e.location,
        notes: e.notes,
        event: e,
      });
    }

    for (const x of data.contacts) {
      if (!x.followUp) continue;
      if (!caseId && !liveCase(x.caseId)) continue;
      if (x.followUpDone && !includeDone) continue;
      const c = caseById.get(x.caseId);
      out.push({
        key: `c-${x.id}`,
        source: 'contacto',
        id: x.id,
        date: x.followUp,
        time: '',
        endTime: '',
        title: `Voltar a contactar ${x.person || 'interlocutor'}`,
        subtitle: x.summary,
        caseId: x.caseId,
        caseName: c?.name ?? '',
        assigneeId: c?.responsibleId ?? '',
        done: x.followUpDone,
        state: dueState(x.followUp, x.followUpDone ? 'concluido' : 'pendente'),
        critical: false,
      });
    }
    return out.sort(byDateTime);
  }, [data, caseId, includeDone]);
}

export function groupByDate(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const m = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const l = m.get(it.date);
    if (l) l.push(it);
    else m.set(it.date, [it]);
  }
  return m;
}

/** Calendário de feriados de acordo com as definições do escritório. */
export function useHolidayCalendar(): HolidayCalendar {
  const { municipalHoliday } = useSettings();
  return useMemo(() => new HolidayCalendar({ municipal: resolveMunicipal(municipalHoliday) }), [municipalHoliday]);
}

// ---------------------------------------------------------------------------
// Exportação .ics

export function toIcsEvents(items: AgendaItem[]): IcsEvent[] {
  return items
    .filter((i) => !i.done)
    .map((i) => {
      const prefix = i.source === 'prazo' ? 'Prazo: ' : i.source === 'contacto' ? '' : '';
      const desc = [
        i.caseName && `Dossier: ${i.caseName}`,
        i.subtitle && i.source !== 'evento' && i.subtitle,
        i.notes,
        'Balcão das Sucessões',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        uid: `${i.key}@balcao-sucessoes`,
        title: `${prefix}${i.title}${i.caseName && i.source !== 'evento' ? ` — ${i.caseName}` : ''}`,
        description: desc,
        location: i.location,
        date: i.date,
        time: i.time || undefined,
        endTime: i.endTime || undefined,
        alarmDaysBefore: i.time ? undefined : i.source === 'prazo' ? 3 : 0,
        alarmMinutesBefore: i.time ? 60 : undefined,
        categories: [i.source === 'prazo' ? 'Prazo' : i.source === 'evento' ? 'Evento' : 'Contacto'],
      };
    });
}

export function exportIcs(items: AgendaItem[], name: string, filename: string): number {
  const events = toIcsEvents(items);
  downloadFile(filename, buildIcs(events, name), 'text/calendar;charset=utf-8');
  return events.length;
}

export function icsFilename(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${slug || 'agenda'}-${todayIso()}.ics`;
}
