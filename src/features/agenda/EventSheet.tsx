import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { deleteEvent, saveEvent } from '../../lib/actions';
import { EVENT_KIND_LABELS, useHolidayCalendar } from '../../lib/agenda';
import { db } from '../../lib/db';
import { useMembers } from '../../lib/hooks';
import type { EventKind, EventRecord } from '../../lib/types';
import { cx, formatDate } from '../../lib/utils';
import { judicialHoliday } from '../../engine/calendar';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet, useConfirm } from '../../components/ui';

export interface EventSheetState {
  event: EventRecord;
  isNew: boolean;
  /** Bloqueia a escolha do dossier (ex.: aberto a partir de um dossier). */
  lockCase?: boolean;
}

export function EventSheet({ state, onClose }: { state: EventSheetState | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const members = useMembers();
  const holidays = useHolidayCalendar();
  const cases = useLiveQuery(
    async () => (await db.cases.filter((c) => c.stage === 'ativo' || c.stage === 'suspenso').toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [],
  );
  const [e, setE] = useState<EventRecord | null>(state?.event ?? null);
  const [allDay, setAllDay] = useState(!state?.event.time);
  useEffect(() => {
    setE(state?.event ?? null);
    setAllDay(!state?.event.time);
  }, [state]);

  if (!state || !e) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = (p: Partial<EventRecord>) => setE((x) => (x ? { ...x, ...p } : x));
  const why = e.date ? holidays.whyNotBusiness(e.date) : null;
  const judicial = e.date ? judicialHoliday(e.date) : undefined;
  const invalid = !e.title.trim() || !e.date || (!allDay && !e.time);

  async function save() {
    if (!e || invalid) return;
    const rec = { ...e, title: e.title.trim(), time: allDay ? '' : e.time, endTime: allDay ? '' : e.endTime };
    await saveEvent(rec, state!.isNew);
    toast({ tone: 'success', title: state!.isNew ? 'Evento agendado' : 'Evento atualizado', description: `${formatDate(rec.date, 'long')}${rec.time ? ` às ${rec.time}` : ''}` });
    onClose();
  }

  async function remove() {
    if (!e) return;
    if (!(await confirm({ title: 'Remover este evento?', confirmLabel: 'Remover', danger: true }))) return;
    await deleteEvent(e);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={state.isNew ? 'Novo evento' : e.title || 'Evento'}
      subtitle="Escrituras, reuniões, diligências e prazos próprios"
      icon={CalendarPlus}
      footer={
        <>
          {!state.isNew && (
            <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
              Remover
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={invalid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Field label="Título *" htmlFor="ev-title">
          <input
            id="ev-title"
            className="input"
            data-autofocus
            value={e.title}
            placeholder="Ex.: Escritura de habilitação — Cartório de Lisboa"
            onChange={(x) => set({ title: x.target.value })}
          />
        </Field>

        <div className="field">
          <span className="field-label">Tipo</span>
          <div className="choices">
            {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((k) => (
              <button key={k} type="button" className="choice" aria-pressed={e.kind === k} onClick={() => set({ kind: k })}>
                {EVENT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <Field
            label="Data *"
            htmlFor="ev-date"
            hint={
              why
                ? undefined
                : judicial
                  ? `${judicial.name}`
                  : e.date
                    ? formatDate(e.date, 'long')
                    : undefined
            }
            error={why ? `Atenção: ${why}` : undefined}
          >
            <input id="ev-date" type="date" className={cx('input', why && 'invalid')} value={e.date} onChange={(x) => set({ date: x.target.value })} />
          </Field>
          <div className="field">
            <span className="field-label">Horário</span>
            <label className="checkbox" style={{ height: 38 }}>
              <input type="checkbox" checked={allDay} onChange={(x) => setAllDay(x.target.checked)} />
              Dia inteiro
            </label>
          </div>
          {!allDay && (
            <>
              <Field label="Início *" htmlFor="ev-time">
                <input id="ev-time" type="time" className="input" value={e.time} onChange={(x) => set({ time: x.target.value })} />
              </Field>
              <Field label="Fim" htmlFor="ev-end">
                <input id="ev-end" type="time" className="input" value={e.endTime} min={e.time} onChange={(x) => set({ endTime: x.target.value })} />
              </Field>
            </>
          )}
          <Field label="Dossier" htmlFor="ev-case" className="span-2">
            <select id="ev-case" className="select" value={e.caseId} disabled={state.lockCase} onChange={(x) => set({ caseId: x.target.value })}>
              <option value="">Evento geral (sem dossier)</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ref} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável" htmlFor="ev-who">
            <select id="ev-who" className="select" value={e.assigneeId} onChange={(x) => set({ assigneeId: x.target.value })}>
              <option value="">Responsável do dossier</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Local" htmlFor="ev-loc">
            <input id="ev-loc" className="input" value={e.location} placeholder="Cartório, conservatória, videochamada…" onChange={(x) => set({ location: x.target.value })} />
          </Field>
          <Field label="Notas" htmlFor="ev-notes" className="span-2">
            <textarea id="ev-notes" className="textarea" value={e.notes} onChange={(x) => set({ notes: x.target.value })} />
          </Field>
        </div>

        {!state.isNew && (
          <label className="checkbox">
            <input type="checkbox" checked={e.done} onChange={(x) => set({ done: x.target.checked })} />
            Realizado
          </label>
        )}
      </div>
    </Sheet>
  );
}
