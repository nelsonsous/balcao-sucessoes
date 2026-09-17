import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AtSign,
  CalendarCheck,
  Check,
  MessageSquare,
  NotebookPen,
  Phone,
  Pin,
  PinOff,
  Plus,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  addContact,
  addNote,
  deleteContact,
  deleteNote,
  updateCase,
  updateContact,
  updateNote,
} from '../../lib/actions';
import { db } from '../../lib/db';
import { CHANNEL_LABELS, ROLE_LABELS } from '../../lib/labels';
import type { CaseRecord, Channel, PartyRole } from '../../lib/types';
import { cx, formatDate, relativeDays, timeAgo, todayIso } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Field, useConfirm, useDebounced } from '../../components/ui';

const PREFERRED: Record<CaseRecord['client']['preferred'], string> = {
  email: 'Email',
  telefone: 'Telefone',
  reuniao: 'Reunião',
  outro: 'Outro',
};

export function NotesTab({ c }: { c: CaseRecord }) {
  const data = useLiveQuery(async () => {
    const [notes, contacts] = await Promise.all([
      db.notes.where('caseId').equals(c.id).toArray(),
      db.contacts.where('caseId').equals(c.id).toArray(),
    ]);
    notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    contacts.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return { notes, contacts };
  }, [c.id]);
  const toast = useToast();
  const confirm = useConfirm();

  const [noteText, setNoteText] = useState('');
  const [general, setGeneral] = useState(c.generalNotes);
  const debounced = useDebounced(general, 700);
  const [saved, setSaved] = useState(false);
  useEffect(() => setGeneral(c.generalNotes), [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (debounced !== c.generalNotes) {
      void updateCase(c.id, { generalNotes: debounced }).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      });
    }
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const [log, setLog] = useState({
    date: todayIso(),
    person: '',
    role: 'a_confirmar' as PartyRole,
    channel: 'email' as Channel,
    summary: '',
    followUp: '',
  });

  async function submitLog() {
    if (!log.person.trim() && !log.summary.trim()) return;
    await addContact(c.id, { ...log, person: log.person.trim(), summary: log.summary.trim(), followUpDone: false });
    setLog((l) => ({ ...l, person: '', summary: '', followUp: '' }));
    toast({ tone: 'success', title: 'Contacto registado' });
  }

  const notes = data?.notes ?? [];
  const contacts = data?.contacts ?? [];

  return (
    <div className="notes-layout">
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <Card>
          <CardHead icon={Star} title="Notas importantes" subtitle="Informação que toda a equipa deve ter presente." />
          <div className="card-body">
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteText.trim()) return;
                void addNote(c.id, noteText.trim(), true).then(() => setNoteText(''));
              }}
            >
              <input
                className="input"
                placeholder="Ex.: documentação original a aguardar"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                aria-label="Nova nota importante"
              />
              <Button type="submit" variant="primary" icon={Plus} disabled={!noteText.trim()}>
                Adicionar
              </Button>
            </form>
            <ul className="note-list">
              {notes.map((n) => (
                <li key={n.id} className={cx(n.pinned && 'pinned')}>
                  {n.pinned ? <Pin className="note-pin" aria-label="Fixada" /> : <span className="bullet" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="note-text">{n.text}</div>
                    <div className="tiny subtle">{timeAgo(n.createdAt)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={n.pinned ? PinOff : Pin}
                    aria-label={n.pinned ? 'Desafixar' : 'Fixar'}
                    onClick={() => void updateNote(n, { pinned: !n.pinned })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Trash2}
                    aria-label="Apagar nota"
                    onClick={async () => {
                      if (await confirm({ title: 'Apagar esta nota?', confirmLabel: 'Apagar', danger: true })) await deleteNote(n);
                    }}
                  />
                </li>
              ))}
              {notes.length === 0 && <li className="subtle small">Sem notas.</li>}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHead
            icon={NotebookPen}
            title="Observações do dossier"
            subtitle="Preferências do cliente, documentos em falta, ausências, próximos contactos…"
            actions={saved ? <span className="badge ok"><Check aria-hidden /> Guardado</span> : undefined}
          />
          <div className="card-body">
            <textarea
              className="textarea"
              style={{ minHeight: 140 }}
              value={general}
              onChange={(e) => setGeneral(e.target.value)}
              aria-label="Observações do dossier"
              placeholder="Escreva livremente — é guardado automaticamente."
            />
          </div>
        </Card>

        <Card>
          <CardHead icon={MessageSquare} title="Registo de contactos" subtitle="O que foi dito, a quem e quando — e o próximo passo." />
          <div className="card-body">
            <form
              className="contact-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitLog();
              }}
            >
              <Field label="Data" htmlFor="l-date">
                <input id="l-date" type="date" className="input" value={log.date} onChange={(e) => setLog({ ...log, date: e.target.value })} />
              </Field>
              <Field label="Pessoa / entidade" htmlFor="l-person">
                <input
                  id="l-person"
                  className="input"
                  placeholder="Cliente, notário, banco…"
                  value={log.person}
                  onChange={(e) => setLog({ ...log, person: e.target.value })}
                />
              </Field>
              <Field label="Qualidade" htmlFor="l-role">
                <select id="l-role" className="select" value={log.role} onChange={(e) => setLog({ ...log, role: e.target.value as PartyRole })}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Meio" htmlFor="l-channel">
                <select id="l-channel" className="select" value={log.channel} onChange={(e) => setLog({ ...log, channel: e.target.value as Channel })}>
                  {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Resumo" htmlFor="l-summary" className="span-2">
                <input id="l-summary" className="input" placeholder="Resumo muito breve" value={log.summary} onChange={(e) => setLog({ ...log, summary: e.target.value })} />
              </Field>
              <Field label="Voltar a contactar em" htmlFor="l-follow" hint="Opcional — aparece como lembrete.">
                <input id="l-follow" type="date" className="input" value={log.followUp} onChange={(e) => setLog({ ...log, followUp: e.target.value })} />
              </Field>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" icon={Plus} disabled={!log.person.trim() && !log.summary.trim()}>
                  Registar contacto
                </Button>
              </div>
            </form>

            <ol className="timeline">
              {contacts.map((x) => {
                const fu = x.followUp && !x.followUpDone ? dueState(x.followUp, 'pendente') : null;
                return (
                  <li key={x.id}>
                    <span className="tl-dot" aria-hidden />
                    <div className="tl-body">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <strong>{formatDate(x.date)}</strong>
                        <span>· {x.person || '—'}</span>
                        <span className="badge">{CHANNEL_LABELS[x.channel]}</span>
                        <span className="tiny subtle">{ROLE_LABELS[x.role]}</span>
                      </div>
                      {x.summary && <div className="muted">{x.summary}</div>}
                      {x.followUp && (
                        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                          <span className={cx('due', x.followUpDone ? 'cumprido' : fu ?? '')}>
                            <CalendarCheck aria-hidden />
                            Voltar a contactar: {formatDate(x.followUp)} {!x.followUpDone && `(${relativeDays(x.followUp)})`}
                          </span>
                          <button type="button" className="btn ghost sm" onClick={() => void updateContact(x, { followUpDone: !x.followUpDone })}>
                            {x.followUpDone ? 'Reabrir' : 'Marcar feito'}
                          </button>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={Trash2}
                      aria-label="Apagar registo"
                      onClick={async () => {
                        if (await confirm({ title: 'Apagar este registo de contacto?', confirmLabel: 'Apagar', danger: true })) await deleteContact(x);
                      }}
                    />
                  </li>
                );
              })}
              {contacts.length === 0 && <li className="subtle small">Ainda sem contactos registados.</li>}
            </ol>
          </div>
        </Card>
      </div>

      <Card className="client-card">
        <CardHead icon={UserRound} title="Contacto do cliente" />
        <div className="card-body">
          {c.client.name ? (
            <dl className="summary-grid one-col">
              <dt>Nome</dt>
              <dd className="strong">{c.client.name}</dd>
              <dt>Email</dt>
              <dd>
                {c.client.email ? (
                  <a href={`mailto:${c.client.email}`}>
                    <AtSign size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> {c.client.email}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Telefone</dt>
              <dd>
                {c.client.phone ? (
                  <a href={`tel:${c.client.phone.replace(/\s+/g, '')}`}>
                    <Phone size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> {c.client.phone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>País</dt>
              <dd>{c.client.country || '—'}</dd>
              <dt>Preferência</dt>
              <dd>
                <span className="badge brand">{PREFERRED[c.client.preferred]}</span>
              </dd>
              <dt>Morada</dt>
              <dd>{c.client.address || '—'}</dd>
            </dl>
          ) : (
            <p className="subtle small">Sem dados de contacto. Use “Editar” no topo do dossier.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
