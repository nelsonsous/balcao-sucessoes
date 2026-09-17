import { useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { saveCaseTemplate } from '../../lib/actions';
import { templateFromCase } from '../../lib/caseTemplates';
import type { CaseRecord, TaskRecord } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

/** Guarda o questionário, etiquetas, prioridade e tarefas próprias deste dossier como modelo reutilizável. */
export function SaveTemplateSheet({ c, tasks, open, onClose }: { c: CaseRecord; tasks: TaskRecord[]; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const manual = tasks.filter((t) => !t.ruleKey && !t.obsolete).length;

  async function save() {
    const t = templateFromCase(c, tasks, name, description.trim());
    await saveCaseTemplate(t);
    toast({ tone: 'success', title: 'Modelo guardado', description: 'Disponível em “Nova sucessão → Começar a partir de um modelo”.' });
    setName('');
    setDescription('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      title="Guardar como modelo de dossier"
      subtitle="Guarda as respostas ao questionário, as etiquetas, a prioridade e as tarefas próprias — sem dados pessoais."
      icon={BookmarkPlus}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>
            Guardar modelo
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Nome do modelo *" htmlFor="tpl-name">
          <input id="tpl-name" className="input" data-autofocus value={name} placeholder="Ex.: Sucessão com bens em França" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void save()} />
        </Field>
        <Field label="Descrição" htmlFor="tpl-desc" hint="Quando usar este modelo.">
          <textarea id="tpl-desc" className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <p className="small subtle">
          Inclui {Object.values(c.answers).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== '')).length} respostas, {c.tags.length} etiqueta(s) e {manual} tarefa(s) própria(s).
        </p>
      </div>
    </Sheet>
  );
}
