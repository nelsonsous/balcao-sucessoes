import type { CSSProperties } from 'react';
import { Check, Info } from 'lucide-react';
import type { Answers } from '../../lib/types';
import { COUNTRIES, STEPS, pruneHidden, visibleQuestions, type Question, type StepId } from '../../engine/questions';

function setAnswer(a: Answers, id: keyof Answers, value: unknown): Answers {
  return pruneHidden({ ...a, [id]: value } as Answers);
}

export function QuestionBlock({ q, answers, onChange }: { q: Question; answers: Answers; onChange: (a: Answers) => void }) {
  const v = answers[q.id];
  const labelId = `q-${q.id}`;
  return (
    <div className="q-block" role="group" aria-labelledby={labelId}>
      <div className="q-label" id={labelId}>
        {q.label}
      </div>
      {q.help && (
        <div className="q-help">
          <Info aria-hidden />
          {q.help}
        </div>
      )}

      {q.type === 'single' && (
        <div className="choices">
          {q.options!.map((o) => (
            <button
              key={o.value}
              type="button"
              className="choice"
              aria-pressed={v === o.value}
              onClick={() => onChange(setAnswer(answers, q.id, v === o.value ? '' : o.value))}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {q.type === 'multi' && (
        <div className="choices">
          {q.options!.map((o) => {
            const list = (v as string[]) ?? [];
            const on = list.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                className="choice"
                aria-checked={on}
                onClick={() => {
                  let next: string[];
                  if (on) next = list.filter((x) => x !== o.value);
                  else if (q.exclusive?.includes(o.value)) next = [o.value];
                  else next = [...list.filter((x) => !q.exclusive?.includes(x)), o.value];
                  onChange(setAnswer(answers, q.id, next));
                }}
              >
                <span className="tick">
                  <Check aria-hidden />
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'countries' && (
        <div className="choices">
          {COUNTRIES.map((c) => {
            const list = (v as string[]) ?? [];
            const on = list.includes(c);
            return (
              <button
                key={c}
                type="button"
                role="checkbox"
                className="choice"
                aria-checked={on}
                onClick={() => onChange(setAnswer(answers, q.id, on ? list.filter((x) => x !== c) : [...list, c]))}
              >
                <span className="tick">
                  <Check aria-hidden />
                </span>
                {c}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'country' && (
        <select
          className="select"
          style={{ maxWidth: 320 }}
          aria-labelledby={labelId}
          value={(v as string) ?? ''}
          onChange={(e) => onChange(setAnswer(answers, q.id, e.target.value))}
        >
          <option value="">Selecionar país…</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {q.type === 'number' && (
        <input
          className="input"
          style={{ maxWidth: 140 }}
          type="number"
          min={0}
          max={30}
          inputMode="numeric"
          aria-labelledby={labelId}
          value={(v as string) ?? ''}
          onChange={(e) => onChange(setAnswer(answers, q.id, e.target.value))}
        />
      )}
    </div>
  );
}

export function QuestionStep({ step, answers, onChange }: { step: StepId; answers: Answers; onChange: (a: Answers) => void }) {
  return (
    <div className="q-list">
      {visibleQuestions(answers, step).map((q) => (
        <QuestionBlock key={q.id} q={q} answers={answers} onChange={onChange} />
      ))}
    </div>
  );
}

export function QuestionnaireForm({ answers, onChange }: { answers: Answers; onChange: (a: Answers) => void }) {
  return (
    <div className="stack" style={{ '--gap': '8px' } as CSSProperties}>
      {STEPS.map((s, i) => (
        <section key={s.id} className="q-section">
          <div className="q-section-head">
            <span className="q-step-num">{i + 1}</span>
            <div>
              <h3>{s.label}</h3>
              <p className="subtle small">{s.description}</p>
            </div>
          </div>
          <QuestionStep step={s.id} answers={answers} onChange={onChange} />
        </section>
      ))}
    </div>
  );
}
