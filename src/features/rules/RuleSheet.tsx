import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2, Workflow, X } from 'lucide-react';
import { PHASES } from '../../engine/phases';
import { QUESTIONS, STEPS } from '../../engine/questions';
import {
  DEADLINE_KINDS,
  OPS_BY_TYPE,
  OP_LABELS,
  QUESTION_SHORT,
  defaultCondition,
  opNeedsValue,
  questionById,
  questionOptions,
  ruleApplies,
  validateRule,
} from '../../engine/officeRules';
import { newOfficeRuleTask } from '../../lib/db';
import { isRuleTarget } from '../../lib/officeRules';
import type { Answers, CaseRecord, OfficeRuleCondition, OfficeRuleOp, OfficeRuleRecord, OfficeRuleTask, PhaseId } from '../../lib/types';
import { Button, Field, Segmented, Sheet } from '../../components/ui';

const clone = (r: OfficeRuleRecord): OfficeRuleRecord => ({
  ...r,
  conditions: r.conditions.map((c) => ({ ...c })),
  tasks: r.tasks.map((t) => ({ ...t, docs: [...t.docs], legal: [...t.legal], ...(t.deadline ? { deadline: { ...t.deadline } } : {}) })),
});

/** Linhas de texto limpas (documentos, referências). */
const lines = (xs: string[]): string[] => xs.map((x) => x.trim()).filter(Boolean);

/** Regra pronta a gravar: sem linhas vazias e sem valores em condições que não os usam. */
export function cleanRule(r: OfficeRuleRecord): OfficeRuleRecord {
  return {
    ...r,
    name: r.name.trim(),
    reason: r.reason.trim(),
    conditions: r.conditions.map((c) => ({ ...c, value: opNeedsValue(c.op) ? c.value.trim() : '' })),
    tasks: r.tasks.map((t) => ({ ...t, title: t.title.trim(), description: t.description.trim(), docs: lines(t.docs), legal: lines(t.legal) })),
  };
}

/** Editor de uma regra do escritório: condições sobre o questionário e tarefas geradas. */
export function RuleSheet({
  rule,
  isNew = false,
  cases,
  onClose,
  onSave,
  onDelete,
}: {
  rule: OfficeRuleRecord | null;
  /** Regra ainda não gravada (sem «Remover»). */
  isNew?: boolean;
  cases: CaseRecord[];
  onClose: () => void;
  onSave: (r: OfficeRuleRecord) => Promise<void>;
  onDelete?: (r: OfficeRuleRecord) => void;
}) {
  const [draft, setDraft] = useState<OfficeRuleRecord | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(rule ? clone(rule) : null);
    setTried(false);
    setBusy(false);
  }, [rule]);

  const issues = useMemo(() => (draft ? validateRule(cleanRule(draft)) : []), [draft]);
  const targets = useMemo(() => cases.filter(isRuleTarget), [cases]);
  const matching = useMemo(() => (draft ? targets.filter((c) => ruleApplies(cleanRule(draft), c.answers)) : []), [draft, targets]);

  if (!draft) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const set = (patch: Partial<OfficeRuleRecord>) => setDraft({ ...draft, ...patch });
  const setCond = (i: number, c: OfficeRuleCondition) => set({ conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });
  const setTask = (i: number, patch: Partial<OfficeRuleTask>) => set({ tasks: draft.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const replaceTask = (i: number, next: OfficeRuleTask) => set({ tasks: draft.tasks.map((t, j) => (j === i ? next : t)) });

  const save = async () => {
    setTried(true);
    if (issues.length) return;
    setBusy(true);
    try {
      await onSave(cleanRule(draft));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      icon={Workflow}
      title={isNew ? 'Nova regra do escritório' : 'Editar regra'}
      subtitle="Quando as respostas do questionário cumprem as condições, as tarefas entram na checklist do dossier."
      footer={
        <>
          {!isNew && onDelete && (
            <Button variant="danger-soft" icon={Trash2} onClick={() => onDelete(draft)}>
              Remover
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Guardar regra
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <Field label="Nome da regra" htmlFor="rule-name">
          <input id="rule-name" className="input" data-autofocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Contas bancárias — extratos" />
        </Field>
        <Field label="Porque existe" htmlFor="rule-reason" hint="Aparece na tarefa como «Gerada porque…». Se ficar vazio, usa o nome da regra.">
          <input id="rule-reason" className="input" value={draft.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Ex.: há contas bancárias" />
        </Field>

        <section className="rule-section" aria-labelledby="rule-when">
          <div className="rule-section-head">
            <h3 id="rule-when" className="section-title">
              Quando se aplica
            </h3>
            {draft.conditions.length > 1 && (
              <Segmented
                label="Combinação das condições"
                value={draft.match}
                onChange={(match) => set({ match })}
                options={[
                  { value: 'all', label: 'Todas' },
                  { value: 'any', label: 'Qualquer uma' },
                ]}
              />
            )}
          </div>
          {draft.conditions.length === 0 ? (
            <p className="small subtle">Sem condições: a regra aplica-se a todos os dossiers.</p>
          ) : (
            <ol className="cond-list">
              {draft.conditions.map((c, i) => (
                <ConditionRow key={i} index={i} c={c} onChange={(x) => setCond(i, x)} onRemove={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })} />
              ))}
            </ol>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <Button size="sm" icon={Plus} onClick={() => set({ conditions: [...draft.conditions, defaultCondition('assets')] })}>
              Acrescentar condição
            </Button>
            <span className="tiny subtle">«Não é» e «não inclui» só contam quando a pergunta já foi respondida.</span>
          </div>
        </section>

        <section className="rule-section" aria-labelledby="rule-tasks">
          <h3 id="rule-tasks" className="section-title">
            Tarefas a criar
          </h3>
          {draft.tasks.map((t, i) => (
            <TaskEditor
              key={t.key}
              index={i}
              t={t}
              canRemove={draft.tasks.length > 1}
              onChange={(patch) => setTask(i, patch)}
              onReplace={(next) => replaceTask(i, next)}
              onRemove={() => set({ tasks: draft.tasks.filter((_, j) => j !== i) })}
            />
          ))}
          <div>
            <Button size="sm" icon={Plus} onClick={() => set({ tasks: [...draft.tasks, newOfficeRuleTask()] })}>
              Acrescentar tarefa
            </Button>
          </div>
        </section>

        <div className="callout" data-testid="rule-preview">
          <ListChecks aria-hidden />
          <div>
            <strong>
              Aplica-se hoje a {matching.length} de {targets.length} {targets.length === 1 ? 'dossier em curso' : 'dossiers em curso'}
            </strong>
            {matching.length > 0 && (
              <div className="small muted" style={{ marginTop: 4 }}>
                {matching
                  .slice(0, 5)
                  .map((c) => `${c.ref} · ${c.name}`)
                  .join('; ')}
                {matching.length > 5 ? ` e mais ${matching.length - 5}` : ''}
              </div>
            )}
            <div className="tiny subtle" style={{ marginTop: 4 }}>
              Depois de guardar, as alterações entram nos dossiers quando carregar em «Aplicar aos dossiers» (ou ao guardar o questionário de cada um). Conteúdo da responsabilidade da equipa — validar antes de usar.
            </div>
          </div>
        </div>

        {tried && issues.length > 0 && (
          <div className="callout danger" role="alert">
            <X aria-hidden />
            <ul className="rule-issues">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ConditionRow({ c, index, onChange, onRemove }: { c: OfficeRuleCondition; index: number; onChange: (c: OfficeRuleCondition) => void; onRemove: () => void }) {
  const q = questionById(c.question);
  const ops = q ? OPS_BY_TYPE[q.type] : [];
  const n = index + 1;
  return (
    <li className="cond-row" aria-label={`Condição ${n}`}>
      <div className="cond-fields">
        <select className="select" aria-label={`Pergunta da condição ${n}`} value={c.question} onChange={(e) => onChange(defaultCondition(e.target.value as keyof Answers))}>
          {STEPS.map((s) => (
            <optgroup key={s.id} label={s.label}>
              {QUESTIONS.filter((x) => x.step === s.id).map((x) => (
                <option key={x.id} value={x.id}>
                  {QUESTION_SHORT[x.id]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="select" aria-label={`Operador da condição ${n}`} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as OfficeRuleOp })}>
          {ops.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>
        {q && opNeedsValue(c.op) ? (
          q.type === 'number' ? (
            <input className="input" type="number" min={0} inputMode="numeric" aria-label={`Valor da condição ${n}`} value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })} />
          ) : (
            <select className="select" aria-label={`Valor da condição ${n}`} value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })}>
              {questionOptions(q).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        ) : (
          <span aria-hidden />
        )}
      </div>
      <Button variant="ghost" size="sm" iconOnly icon={X} aria-label={`Remover a condição ${n}`} onClick={onRemove} />
    </li>
  );
}

function TaskEditor({
  t,
  index,
  canRemove,
  onChange,
  onReplace,
  onRemove,
}: {
  t: OfficeRuleTask;
  index: number;
  canRemove: boolean;
  onChange: (p: Partial<OfficeRuleTask>) => void;
  onReplace: (t: OfficeRuleTask) => void;
  onRemove: () => void;
}) {
  const id = (s: string) => `rt-${t.key}-${s}`;
  const n = index + 1;
  return (
    <fieldset className="rule-task">
      <legend className="sr-only">Tarefa {n}</legend>
      <div className="rule-section-head">
        <span className="rule-task-label" aria-hidden>
          Tarefa {n}
        </span>
        {canRemove && <Button variant="ghost" size="sm" iconOnly icon={Trash2} aria-label={`Remover a tarefa ${n}`} onClick={onRemove} />}
      </div>
      <Field label="Título" htmlFor={id('title')}>
        <input id={id('title')} className="input" value={t.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Ex.: Pedir extratos dos últimos 12 meses" />
      </Field>
      <div className="rule-task-grid">
        <Field label="Fase" htmlFor={id('phase')}>
          <select id={id('phase')} className="select" value={t.phase} onChange={(e) => onChange({ phase: e.target.value as PhaseId })}>
            {PHASES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prazo" htmlFor={id('due')}>
          <div className="row" style={{ gap: 6 }}>
            {t.deadline && (
              <input
                className="input due-amount"
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                aria-label={`Quantidade do prazo da tarefa ${n}`}
                value={t.deadline.amount || ''}
                onChange={(e) => onChange({ deadline: { ...t.deadline!, amount: Number(e.target.value) } })}
              />
            )}
            <select
              id={id('due')}
              className="select"
              value={t.deadline?.kind ?? ''}
              onChange={(e) => {
                const kind = e.target.value as NonNullable<OfficeRuleTask['deadline']>['kind'] | '';
                if (kind) onChange({ deadline: { kind, amount: t.deadline?.amount || (kind === 'daysAfter' ? 30 : 2) } });
                else {
                  const { deadline: _removed, ...rest } = t;
                  void _removed;
                  onReplace(rest);
                }
              }}
            >
              <option value="">Sem prazo</option>
              {DEADLINE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={t.critical} onChange={(e) => onChange({ critical: e.target.checked })} />
        Crítica (bloqueia o avanço do dossier)
      </label>
      <Field label="Como fazer" htmlFor={id('desc')}>
        <textarea id={id('desc')} className="textarea" rows={2} value={t.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <div className="rule-task-grid">
        <Field label="Documentos (um por linha)" htmlFor={id('docs')}>
          <textarea id={id('docs')} className="textarea" rows={2} value={t.docs.join('\n')} onChange={(e) => onChange({ docs: e.target.value.split('\n') })} />
        </Field>
        <Field label="Referências legais (uma por linha)" htmlFor={id('legal')} hint="A validar pela equipa.">
          <textarea id={id('legal')} className="textarea" rows={2} value={t.legal.join('\n')} onChange={(e) => onChange({ legal: e.target.value.split('\n') })} />
        </Field>
      </div>
    </fieldset>
  );
}
