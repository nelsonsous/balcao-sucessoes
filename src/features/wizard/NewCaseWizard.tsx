import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Sparkles,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { createCase, saveMember } from '../../lib/actions';
import { emptyAnswers, emptyClient, emptyDeceased } from '../../lib/db';
import { useMembers } from '../../lib/hooks';
import { checkNif } from '../../lib/nif';
import type { Answers, ClientInfo, Deceased, Priority } from '../../lib/types';
import { cx, formatDate, relativeDays, todayIso } from '../../lib/utils';
import { countByPhase, desiredTasks, dueFor } from '../../engine/engine';
import { PHASES, phaseLabel } from '../../engine/phases';
import { STEPS, answerLabel, completion, visibleQuestions } from '../../engine/questions';
import { PHASE_ICONS } from '../../components/icons';
import { useToast } from '../../components/Toast';
import { Button, Card, Field } from '../../components/ui';
import { QuestionStep } from '../dossiers/QuestionnaireForm';

const DRAFT_KEY = 'bs-wizard-draft';

interface Draft {
  step: number;
  name: string;
  responsibleId: string;
  priority: Priority;
  tags: string;
  deceased: Deceased;
  client: ClientInfo;
  answers: Answers;
}

function emptyDraft(): Draft {
  return {
    step: 0,
    name: '',
    responsibleId: '',
    priority: 'normal',
    tags: '',
    deceased: emptyDeceased(),
    client: emptyClient(),
    answers: emptyAnswers(),
  };
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      return { ...emptyDraft(), ...d, answers: { ...emptyAnswers(), ...(d.answers ?? {}) } };
    }
  } catch {
    /* ignora */
  }
  return emptyDraft();
}

const WIZ_STEPS = [
  { id: 'dados', label: 'Dados do dossier' },
  ...STEPS.map((s) => ({ id: s.id, label: s.label })),
  { id: 'rever', label: 'Rever e criar' },
];

export function NewCaseWizard() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const members = useMembers();
  const [d, setD] = useState<Draft>(loadDraft);
  const [newMember, setNewMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignora */
    }
  }, [d]);

  const tasks = useMemo(() => desiredTasks(d.answers), [d.answers]);
  const phases = useMemo(() => countByPhase(tasks), [tasks]);
  const critical = tasks.filter((t) => t.critical).length;
  const deadlines = useMemo(
    () =>
      tasks
        .filter((t) => t.deadline)
        .map((t) => ({ t, ...dueFor(t, d.deceased.deathDate) }))
        .filter((x) => x.dueDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks, d.deceased.deathDate],
  );

  // Destaque das tarefas que acabaram de aparecer
  const prevKeys = useRef<Set<string>>(new Set(tasks.map((t) => t.key)));
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    const added = tasks.filter((t) => !prevKeys.current.has(t.key)).map((t) => t.title);
    prevKeys.current = new Set(tasks.map((t) => t.key));
    if (added.length) {
      setFresh((f) => [...added, ...f].slice(0, 4));
      const timer = setTimeout(() => setFresh((f) => f.filter((x) => !added.includes(x))), 4500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [tasks]);

  const stepId = WIZ_STEPS[d.step]!.id;
  const progress = completion(d.answers);
  const nif = d.deceased.nif ? checkNif(d.deceased.nif) : null;
  const effectiveName = d.name.trim() || (d.deceased.name.trim() ? `Sucessão de ${d.deceased.name.trim()}` : '');
  const nameMissing = !effectiveName;

  const go = (step: number) => {
    if (d.step === 0 && step > 0 && nameMissing) {
      setTouched(true);
      return;
    }
    setD((x) => ({ ...x, step: Math.max(0, Math.min(WIZ_STEPS.length - 1, step)) }));
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const patchDeceased = (p: Partial<Deceased>) => setD((x) => ({ ...x, deceased: { ...x.deceased, ...p } }));
  const patchClient = (p: Partial<ClientInfo>) => setD((x) => ({ ...x, client: { ...x.client, ...p } }));

  async function addMember() {
    if (!newMember.trim()) return;
    const m = await saveMember({ name: newMember });
    setD((x) => ({ ...x, responsibleId: m.id }));
    setNewMember('');
  }

  async function submit() {
    if (nameMissing) {
      setTouched(true);
      go(0);
      return;
    }
    setBusy(true);
    try {
      const { c, report } = await createCase({
        name: effectiveName,
        responsibleId: d.responsibleId,
        priority: d.priority,
        tags: d.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        deceased: d.deceased,
        client: d.client,
        answers: d.answers,
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignora */
      }
      toast({
        tone: 'success',
        title: 'Dossier criado',
        description: `${c.ref} · ${report.added.length} tarefas geradas pelo questionário`,
      });
      navigate(`/dossiers/${c.id}`);
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setD(emptyDraft());
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignora */
    }
  }

  return (
    <div ref={top}>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} aria-hidden /> Perguntas certas → dossier certo
          </div>
          <h1>Nova sucessão</h1>
          <p className="lede">Responda ao essencial. A checklist adapta-se a cada resposta — só aparece o trabalho aplicável.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={discard}>
            Limpar rascunho
          </Button>
          <Button onClick={() => navigate('/dossiers')}>Cancelar</Button>
        </div>
      </div>

      <ol className="wiz-steps" aria-label="Passos">
        {WIZ_STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={cx('wiz-step', i === d.step && 'current', i < d.step && 'done')}
              aria-current={i === d.step ? 'step' : undefined}
              onClick={() => go(i)}
            >
              <span className="wiz-step-num">{i < d.step ? <Check size={13} aria-hidden /> : i + 1}</span>
              <span className="wiz-step-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wiz-layout">
        <div className="stack" style={{ minWidth: 0 }}>
          {stepId === 'dados' && (
            <>
              <Card pad>
                <h2 style={{ marginBottom: 14 }}>Dossier</h2>
                <div className="form-grid">
                  <Field
                    label="Nome / referência do dossier *"
                    htmlFor="w-name"
                    className="span-2"
                    error={touched && nameMissing ? 'Indique um nome para o dossier (ou o nome do de cujus).' : undefined}
                    hint={!d.name && d.deceased.name ? `Se ficar vazio: “Sucessão de ${d.deceased.name}”` : 'Ex.: Sucessão Família Silva'}
                  >
                    <input
                      id="w-name"
                      className={cx('input', touched && nameMissing && 'invalid')}
                      value={d.name}
                      placeholder="Ex.: Sucessão Família Silva"
                      onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))}
                      autoFocus
                    />
                  </Field>
                  <Field label="Responsável pelo dossier" htmlFor="w-resp">
                    {members.length > 0 ? (
                      <select
                        id="w-resp"
                        className="select"
                        value={d.responsibleId}
                        onChange={(e) => setD((x) => ({ ...x, responsibleId: e.target.value }))}
                      >
                        <option value="">Sem responsável</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="row">
                        <input
                          id="w-resp"
                          className="input"
                          placeholder="Nome"
                          value={newMember}
                          onChange={(e) => setNewMember(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && void addMember()}
                        />
                        <Button icon={UserPlus} onClick={() => void addMember()} disabled={!newMember.trim()}>
                          Adicionar
                        </Button>
                      </div>
                    )}
                  </Field>
                  <Field label="Prioridade" htmlFor="w-prio">
                    <select
                      id="w-prio"
                      className="select"
                      value={d.priority}
                      onChange={(e) => setD((x) => ({ ...x, priority: e.target.value as Priority }))}
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </Field>
                  <Field label="Etiquetas" htmlFor="w-tags" hint="Separadas por vírgulas (ex.: França, Imóveis)" className="span-2">
                    <input id="w-tags" className="input" value={d.tags} onChange={(e) => setD((x) => ({ ...x, tags: e.target.value }))} />
                  </Field>
                </div>
              </Card>

              <Card pad>
                <h2 style={{ marginBottom: 14 }}>De cujus e óbito</h2>
                <div className="form-grid">
                  <Field label="Nome completo do falecido" htmlFor="w-dname" className="span-2">
                    <input id="w-dname" className="input" value={d.deceased.name} onChange={(e) => patchDeceased({ name: e.target.value })} />
                  </Field>
                  <Field
                    label="Data do óbito"
                    htmlFor="w-ddate"
                    hint={d.deceased.deathDate ? relativeDays(d.deceased.deathDate) : 'Necessária para calcular os prazos legais.'}
                  >
                    <input
                      id="w-ddate"
                      type="date"
                      className="input"
                      value={d.deceased.deathDate}
                      max={todayIso()}
                      onChange={(e) => patchDeceased({ deathDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Localidade do óbito" htmlFor="w-dcity">
                    <input id="w-dcity" className="input" value={d.deceased.deathCity} onChange={(e) => patchDeceased({ deathCity: e.target.value })} />
                  </Field>
                  <Field
                    label="NIF do falecido"
                    htmlFor="w-dnif"
                    error={nif && !nif.valid ? nif.reason : undefined}
                    ok={nif && nif.valid ? `NIF válido · ${nif.kind}` : undefined}
                  >
                    <input
                      id="w-dnif"
                      className={cx('input', nif && !nif.valid && 'invalid')}
                      inputMode="numeric"
                      maxLength={9}
                      value={d.deceased.nif}
                      onChange={(e) => patchDeceased({ nif: e.target.value.replace(/\D/g, '') })}
                    />
                  </Field>
                  <Field label="Data de nascimento" htmlFor="w-dbirth">
                    <input id="w-dbirth" type="date" className="input" value={d.deceased.birthDate} onChange={(e) => patchDeceased({ birthDate: e.target.value })} />
                  </Field>
                  <Field label="Último domicílio" htmlFor="w-daddr" className="span-2" hint="Determina o lugar da abertura da sucessão (art. 2031.º CC).">
                    <input id="w-daddr" className="input" value={d.deceased.lastAddress} onChange={(e) => patchDeceased({ lastAddress: e.target.value })} />
                  </Field>
                </div>
              </Card>

              <Card pad>
                <h2 style={{ marginBottom: 14 }}>Cliente</h2>
                <div className="form-grid">
                  <Field label="Nome" htmlFor="w-cname">
                    <input id="w-cname" className="input" value={d.client.name} onChange={(e) => patchClient({ name: e.target.value })} />
                  </Field>
                  <Field label="País" htmlFor="w-ccountry">
                    <input id="w-ccountry" className="input" value={d.client.country} onChange={(e) => patchClient({ country: e.target.value })} />
                  </Field>
                  <Field label="Email" htmlFor="w-cemail">
                    <input id="w-cemail" type="email" className="input" value={d.client.email} onChange={(e) => patchClient({ email: e.target.value })} />
                  </Field>
                  <Field label="Telefone" htmlFor="w-cphone">
                    <input id="w-cphone" type="tel" className="input" placeholder="+351 …" value={d.client.phone} onChange={(e) => patchClient({ phone: e.target.value })} />
                  </Field>
                  <Field label="Contacto preferencial" htmlFor="w-cpref">
                    <select
                      id="w-cpref"
                      className="select"
                      value={d.client.preferred}
                      onChange={(e) => patchClient({ preferred: e.target.value as ClientInfo['preferred'] })}
                    >
                      <option value="email">Email</option>
                      <option value="telefone">Telefone</option>
                      <option value="reuniao">Reunião</option>
                      <option value="outro">Outro</option>
                    </select>
                  </Field>
                  <Field label="Morada" htmlFor="w-caddr">
                    <input id="w-caddr" className="input" value={d.client.address} onChange={(e) => patchClient({ address: e.target.value })} />
                  </Field>
                </div>
              </Card>
            </>
          )}

          {STEPS.some((s) => s.id === stepId) && (
            <Card pad>
              <div className="q-step-head">
                <span className="q-step-num">{d.step}</span>
                <div>
                  <h2>{STEPS.find((s) => s.id === stepId)!.label}</h2>
                  <p className="subtle small">{STEPS.find((s) => s.id === stepId)!.description}</p>
                </div>
              </div>
              <QuestionStep
                step={stepId as (typeof STEPS)[number]['id']}
                answers={d.answers}
                onChange={(answers) => setD((x) => ({ ...x, answers }))}
              />
            </Card>
          )}

          {stepId === 'rever' && (
            <>
              {!d.deceased.deathDate && (
                <div className="callout warn">
                  <TriangleAlert aria-hidden />
                  <div>
                    <strong>Sem data do óbito.</strong> O dossier é criado na mesma, mas os prazos legais (ex.: Imposto do Selo) só
                    são calculados quando a data for indicada.
                  </div>
                </div>
              )}
              <Card pad>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                  <h2>{effectiveName || 'Dossier sem nome'}</h2>
                  <Button size="sm" variant="ghost" onClick={() => go(0)}>
                    Editar dados
                  </Button>
                </div>
                <dl className="summary-grid">
                  <dt>De cujus</dt>
                  <dd>{d.deceased.name || '—'}</dd>
                  <dt>Óbito</dt>
                  <dd>
                    {d.deceased.deathDate ? formatDate(d.deceased.deathDate, 'long') : '—'}
                    {d.deceased.deathCity ? ` · ${d.deceased.deathCity}` : ''}
                  </dd>
                  <dt>Cliente</dt>
                  <dd>{d.client.name || '—'}</dd>
                  <dt>Responsável</dt>
                  <dd>{members.find((m) => m.id === d.responsibleId)?.name ?? '—'}</dd>
                </dl>
              </Card>
              {STEPS.map((s, i) => (
                <Card pad key={s.id}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <h2>{s.label}</h2>
                    <Button size="sm" variant="ghost" onClick={() => go(i + 1)}>
                      Editar
                    </Button>
                  </div>
                  <dl className="summary-grid">
                    {visibleQuestions(d.answers, s.id).map((q) => (
                      <div key={q.id} style={{ display: 'contents' }}>
                        <dt>{q.label}</dt>
                        <dd className={cx(answerLabel(q, d.answers) === '—' && 'subtle')}>{answerLabel(q, d.answers)}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
            </>
          )}

          <div className="wiz-nav">
            <Button icon={ArrowLeft} onClick={() => go(d.step - 1)} disabled={d.step === 0}>
              Anterior
            </Button>
            <span className="spacer" />
            <span className="subtle small desktop-only">
              {progress.answered}/{progress.total} respostas
            </span>
            {d.step < WIZ_STEPS.length - 1 ? (
              <Button variant="primary" iconRight={ArrowRight} onClick={() => go(d.step + 1)}>
                Continuar
              </Button>
            ) : (
              <Button variant="primary" icon={ClipboardCheck} onClick={() => void submit()} disabled={busy}>
                Criar dossier
              </Button>
            )}
          </div>
        </div>

        <aside className="wiz-preview" aria-label="Checklist gerada">
          <Card>
            <div className="preview-head">
              <div className="section-title">
                <Sparkles size={14} aria-hidden /> Checklist a nascer
              </div>
              <div className="preview-total">
                <span className="tabular">{tasks.length}</span>
                <span>tarefas aplicáveis</span>
              </div>
              <div className="row small">
                <span className="badge critical">{critical} críticas</span>
                <span className="badge">
                  {progress.answered}/{progress.total} respondidas
                </span>
              </div>
            </div>
            <ul className="preview-phases">
              {PHASES.map((p) => {
                const c = phases.find((x) => x.phase === p.id);
                const Icon = PHASE_ICONS[p.id];
                return (
                  <li key={p.id} className={cx(!c && 'off')}>
                    <Icon aria-hidden />
                    <span className="truncate">{p.label}</span>
                    <span className="spacer" />
                    {c?.critical ? <span className="crit-dot" title={`${c.critical} crítica(s)`} /> : null}
                    <span className="tabular strong">{c?.total ?? 0}</span>
                  </li>
                );
              })}
            </ul>
            {fresh.length > 0 && (
              <div className="preview-fresh" aria-live="polite">
                {fresh.map((f) => (
                  <div key={f} className="fresh-item">
                    <span>+</span> {f}
                  </div>
                ))}
              </div>
            )}
            {deadlines.length > 0 && (
              <div className="preview-deadlines">
                <div className="section-title" style={{ marginBottom: 8 }}>
                  <CalendarClock size={14} aria-hidden /> Prazos calculados
                </div>
                {deadlines.slice(0, 4).map((x) => (
                  <div key={x.t.key} className="deadline-row">
                    <span className="truncate" title={x.t.title}>
                      {x.t.title.replace(/ —.*$/, '')}
                    </span>
                    <span className="strong nowrap">{formatDate(x.dueDate)}</span>
                  </div>
                ))}
              </div>
            )}
            {stepId === 'rever' && (
              <div className="preview-list">
                {PHASES.map((p) => {
                  const list = tasks.filter((t) => t.phase === p.id);
                  if (!list.length) return null;
                  return (
                    <div key={p.id}>
                      <div className="tiny subtle strong" style={{ margin: '10px 0 4px' }}>
                        {phaseLabel(p.id).toUpperCase()}
                      </div>
                      {list.map((t) => (
                        <div key={t.key} className="preview-task">
                          {t.critical ? <TriangleAlert size={13} className="crit" aria-label="Crítica" /> : <span className="bullet" />}
                          <span>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
