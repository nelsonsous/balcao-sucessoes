import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  FileText,
  Lightbulb,
  ListChecks,
  RotateCcw,
  Scale,
  Trash2,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { Link } from 'wouter';
import { deleteTask, setTaskStatus, updateTask } from '../../lib/actions';
import { useHolidayCalendar } from '../../lib/agenda';
import { useMembers } from '../../lib/hooks';
import type { CaseRecord, PhaseId, TaskRecord } from '../../lib/types';
import { cx, formatDate, formatDateTime, relativeDays } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { PHASES, STATUSES } from '../../engine/phases';
import { syncCaseTasks } from '../../engine/sync';
import { isOfficeKey, ruleIdFromKey } from '../../engine/officeRules';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet, useConfirm } from '../../components/ui';
import { DeadlineCalculator } from '../prazos/DeadlineCalculator';

export function TaskDrawer({ task, onClose, caseRecord }: { task: TaskRecord | null; onClose: () => void; caseRecord: CaseRecord }) {
  const deathDate = caseRecord.deceased.deathDate;
  const members = useMembers();
  const holidays = useHolidayCalendar();
  const toast = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState('');
  const [calc, setCalc] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    setNotes(task?.notes ?? '');
    setTitle(task?.title ?? '');
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const isCustom = !task.ruleKey;
  const isOffice = isOfficeKey(task.ruleKey);
  const ds = dueState(task.dueDate, task.status);
  const notBusiness = task.dueDate ? holidays.whyNotBusiness(task.dueDate) : null;
  const nextBusiness = notBusiness ? holidays.nextBusinessDay(task.dueDate) : '';

  const saveNotes = () => {
    if (notes !== task.notes) void updateTask(task, { notes });
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Remover esta tarefa?',
      message: isCustom
        ? 'A tarefa será removida da checklist.'
        : isOffice
          ? 'Esta tarefa foi gerada por uma regra do escritório e volta a ser criada quando a checklist for atualizada. Em alternativa, pode marcá-la como “Não aplicável”.'
          : 'Esta tarefa foi gerada pelo questionário. Em alternativa, pode marcá-la como “Não aplicável”.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await deleteTask(task);
    onClose();
  };

  return (
    <Sheet
      open={Boolean(task)}
      onClose={() => {
        saveNotes();
        onClose();
      }}
      title={isCustom ? 'Tarefa' : 'Tarefa da checklist'}
      subtitle={PHASES.find((p) => p.id === task.phase)?.label}
      icon={ListChecks}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Remover
          </Button>
          <span className="spacer" />
          <Button
            variant="primary"
            onClick={() => {
              saveNotes();
              onClose();
            }}
          >
            Concluir edição
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        {task.obsolete && (
          <div className="callout warn">
            <TriangleAlert aria-hidden />
            <div>
              <strong>Esta tarefa deixou de se aplicar</strong> segundo as respostas atuais do questionário, mas já tinha trabalho
              registado. Reveja e marque como “Não aplicável” ou remova.
              <div style={{ marginTop: 8 }}>
                <Button size="sm" icon={RotateCcw} onClick={() => void updateTask(task, { obsolete: false })}>
                  Manter na checklist
                </Button>
              </div>
            </div>
          </div>
        )}

        {isCustom ? (
          <Field label="Título" htmlFor="t-title">
            <input
              id="t-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && void updateTask(task, { title: title.trim() })}
            />
          </Field>
        ) : (
          <div>
            <h3 style={{ fontSize: 18, lineHeight: 1.3, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
              {task.critical && <TriangleAlert size={16} className="crit-icon" aria-label="Crítica" />} {task.title}
            </h3>
            {task.reason && (
              <div className="reason-line">
                <Lightbulb aria-hidden /> Gerada porque: <strong>{task.reason}</strong>
              </div>
            )}
            {isOffice && (
              <div className="reason-line">
                <Workflow aria-hidden /> Regra do escritório ·{' '}
                <Link href={`/regras?regra=${ruleIdFromKey(task.ruleKey)}`} onClick={onClose}>
                  ver a regra
                </Link>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Estado
          </div>
          <div className="status-choices">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cx('status-choice', s.id)}
                aria-pressed={task.status === s.id}
                onClick={() => void setTaskStatus(task, s.id)}
              >
                <span className={cx('dot', s.id)} aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <Field
            label="Prazo"
            htmlFor="t-due"
            hint={
              task.dueDate
                ? `${relativeDays(task.dueDate)}${task.dueSource === 'regra' ? ' · calculado automaticamente' : ' · definido manualmente'}`
                : deathDate
                  ? 'Sem prazo definido'
                  : 'Indique a data do óbito para calcular prazos legais'
            }
          >
            <div className="row" style={{ gap: 6 }}>
              <input
                id="t-due"
                type="date"
                className={cx('input', ds === 'atrasado' && 'invalid')}
                value={task.dueDate}
                onChange={(e) =>
                  void updateTask(task, { dueDate: e.target.value, dueSource: e.target.value ? 'manual' : '' }, `Prazo de “${task.title}” alterado para ${formatDate(e.target.value)}`)
                }
              />
              <Button size="sm" onClick={() => setCalc(true)} title="Contar dias corridos ou úteis, meses ou anos (com férias judiciais)">
                Calcular…
              </Button>
            </div>
          </Field>
          <Field label="Responsável" htmlFor="t-assignee">
            <select
              id="t-assignee"
              className="select"
              value={task.assigneeId}
              onChange={(e) => void updateTask(task, { assigneeId: e.target.value })}
            >
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fase" htmlFor="t-phase">
            <select
              id="t-phase"
              className="select"
              value={task.phase}
              disabled={!isCustom}
              onChange={(e) => void updateTask(task, { phase: e.target.value as PhaseId })}
            >
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="field">
            <span className="field-label">Criticidade</span>
            <label className="checkbox" style={{ height: 38 }}>
              <input
                type="checkbox"
                checked={task.critical}
                onChange={(e) => void updateTask(task, { critical: e.target.checked })}
              />
              Tarefa crítica (bloqueia o dossier)
            </label>
          </div>
        </div>

        {notBusiness && ds !== 'cumprido' && (
          <div className="callout warn">
            <CalendarClock aria-hidden />
            <div>
              <strong>O prazo termina num dia não útil ({notBusiness}).</strong> Em regra transfere-se para o primeiro dia útil
              seguinte — {formatDate(nextBusiness, 'long')}. Por prudência, trabalhe com a data original e confirme a regra aplicável.
            </div>
          </div>
        )}

        {task.dueLabel && (
          <div className="callout">
            <CalendarClock aria-hidden />
            <div>
              <strong>Regra do prazo:</strong> {task.dueLabel}
              {task.dueSource === 'manual' && (
                <div style={{ marginTop: 6 }}>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={async () => {
                      await updateTask(task, { dueSource: 'regra' });
                      await syncCaseTasks(caseRecord);
                      toast({ tone: 'success', title: 'Prazo recalculado automaticamente' });
                    }}
                  >
                    Voltar ao prazo automático
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {task.description && (
          <section>
            <div className="field-label" style={{ marginBottom: 6 }}>
              <BookOpen size={14} aria-hidden /> Como fazer
            </div>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {task.description}
            </p>
          </section>
        )}

        {task.docs.length > 0 && (
          <section>
            <div className="field-label" style={{ marginBottom: 8 }}>
              <FileText size={14} aria-hidden /> Documentos habitualmente necessários
            </div>
            <ul className="doc-list">
              {task.docs.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {task.legal.length > 0 && (
          <section>
            <div className="field-label" style={{ marginBottom: 8 }}>
              <Scale size={14} aria-hidden /> Referências
            </div>
            <div className="row wrap">
              {task.legal.map((l) => (
                <span key={l} className="legal-chip">
                  <Scale aria-hidden />
                  {l}
                </span>
              ))}
            </div>
            <p className="tiny subtle" style={{ marginTop: 8 }}>
              Referências de apoio — a validar pela equipa em cada caso concreto.
            </p>
          </section>
        )}

        <Field label="Notas da tarefa" htmlFor="t-notes" hint="Guardadas automaticamente ao sair do campo.">
          <textarea
            id="t-notes"
            className="textarea"
            value={notes}
            placeholder="Ex.: pedido enviado ao banco em 12/09, aguarda resposta…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
          />
        </Field>

        <div className="tiny subtle">
          Criada em {formatDateTime(task.createdAt)} · Atualizada em {formatDateTime(task.updatedAt)}
          {task.completedAt && ` · Concluída em ${formatDateTime(task.completedAt)}`}
        </div>
      </div>
      <Sheet open={calc} onClose={() => setCalc(false)} variant="modal" title="Calcular prazo" subtitle="O resultado passa a ser o prazo desta tarefa, com a regra registada.">
        <DeadlineCalculator
          initialStart={deathDate || undefined}
          applyLabel="Usar como prazo da tarefa"
          onApply={async (r) => {
            await updateTask(task, { dueDate: r.dueDate, dueSource: 'manual', dueLabel: r.label }, `Prazo de “${task.title}” calculado: ${r.label}`);
            setCalc(false);
          }}
        />
      </Sheet>
    </Sheet>
  );
}
