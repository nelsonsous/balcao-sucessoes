import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Sparkles, Undo2 } from 'lucide-react';
import { saveAnswers } from '../../lib/actions';
import { useActiveOfficeRules } from '../../lib/officeRules';
import type { Answers, CaseRecord } from '../../lib/types';
import { desiredTasks } from '../../engine/engine';
import { completion } from '../../engine/questions';
import { describeReport } from '../../engine/sync';
import { useToast } from '../../components/Toast';
import { Button, Card } from '../../components/ui';
import { QuestionnaireForm } from './QuestionnaireForm';

export function QuestionnaireTab({ c }: { c: CaseRecord }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Answers>(c.answers);
  const [busy, setBusy] = useState(false);
  const officeRules = useActiveOfficeRules();

  useEffect(() => setDraft(c.answers), [c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(c.answers);
  const impact = useMemo(() => {
    if (!dirty) return null;
    const current = desiredTasks(c.answers, officeRules);
    const before = new Set(current.map((t) => t.key));
    const after = desiredTasks(draft, officeRules);
    const afterKeys = new Set(after.map((t) => t.key));
    return {
      added: after.filter((t) => !before.has(t.key)).map((t) => t.title),
      gone: current.filter((t) => !afterKeys.has(t.key)).map((t) => t.title),
    };
  }, [draft, c.answers, dirty, officeRules]);

  const prog = completion(draft);

  async function save() {
    setBusy(true);
    try {
      const report = await saveAnswers(c, draft);
      toast({ tone: 'success', title: 'Questionário guardado', description: describeReport(report) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card pad className="q-intro">
        <div className="row wrap" style={{ gap: 14 }}>
          <span className="icon-tile brand">
            <Sparkles aria-hidden />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>Inteligência simples</h2>
            <p className="subtle small">
              Pergunta → condição → tarefa → semáforo. Ao alterar respostas, a checklist é reconciliada: surgem as tarefas novas, as
              que ficam sem efeito e não tinham trabalho são retiradas, e as que já tinham trabalho ficam marcadas para revisão.
            </p>
          </div>
          <span className="badge">
            {prog.answered}/{prog.total} respondidas
          </span>
        </div>
      </Card>

      <QuestionnaireForm answers={draft} onChange={setDraft} />

      <div className={dirtyBarClass(dirty)} role="region" aria-label="Alterações por guardar">
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>Alterações por guardar</strong>
          {impact && (
            <div className="small subtle">
              {impact.added.length > 0 && <span>+{impact.added.length} tarefa(s) nova(s)</span>}
              {impact.added.length > 0 && impact.gone.length > 0 && ' · '}
              {impact.gone.length > 0 && <span>{impact.gone.length} deixa(m) de se aplicar</span>}
              {impact.added.length === 0 && impact.gone.length === 0 && <span>Sem impacto na checklist</span>}
            </div>
          )}
        </div>
        <Button variant="ghost" icon={Undo2} onClick={() => setDraft(c.answers)} disabled={!dirty}>
          Descartar
        </Button>
        <Button variant="primary" icon={busy ? RefreshCw : Save} onClick={() => void save()} disabled={!dirty || busy}>
          Guardar e atualizar checklist
        </Button>
      </div>
    </div>
  );
}

const dirtyBarClass = (dirty: boolean) => `save-bar${dirty ? ' visible' : ''}`;
