import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { saveEvent } from '../../lib/actions';
import { db, newEvent } from '../../lib/db';
import { formatDate } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Field } from '../../components/ui';
import { DeadlineCalculator, type DeadlineApply } from './DeadlineCalculator';

/** Ferramenta: calculadora de prazos com ligação à agenda. */
export function PrazosPage() {
  const toast = useToast();
  const cases = useLiveQuery(async () => (await db.cases.filter((c) => c.stage === 'ativo' || c.stage === 'suspenso').toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')), []);
  const [result, setResult] = useState<DeadlineApply | null>(null);
  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('');

  async function addToAgenda() {
    if (!result) return;
    const ev = newEvent({ caseId, title: title.trim() || `Prazo: ${result.label}`, kind: 'prazo', date: result.dueDate, notes: result.label });
    await saveEvent(ev, true);
    toast({ tone: 'success', title: 'Prazo agendado', description: `${formatDate(result.dueDate, 'long')}${caseId ? ' · no dossier escolhido' : ''}` });
    setResult(null);
    setTitle('');
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <CalendarClock size={14} aria-hidden /> Ferramentas
          </div>
          <h1>Calculadora de prazos</h1>
          <p className="lede">Dias corridos ou úteis, meses e anos, com suspensão nas férias judiciais e transferência para o dia útil seguinte — com a explicação passo a passo.</p>
        </div>
      </div>
      <div className="estate-grid">
        <Card>
          <CardHead icon={CalendarClock} title="Contar um prazo" subtitle="Regras gerais do Código Civil e do Código de Processo Civil — confirme o regime especial de cada prazo." />
          <div className="card-body">
            <DeadlineCalculator onApply={setResult} applyLabel="Agendar este prazo" />
          </div>
        </Card>
        <Card>
          <CardHead icon={CalendarPlus} title="Agendar" subtitle="Cria um evento do tipo «Prazo» na agenda (e no dossier, se escolher um)." />
          <div className="card-body stack" style={{ gap: 12 }}>
            {!result ? (
              <p className="small subtle">Calcule um prazo e escolha «Agendar este prazo».</p>
            ) : (
              <>
                <div className="callout">
                  <CalendarClock aria-hidden />
                  <div>
                    <strong>{formatDate(result.dueDate, 'long')}</strong>
                    <div className="small subtle">{result.label}</div>
                  </div>
                </div>
                <Field label="Título" htmlFor="pz-title">
                  <input id="pz-title" className="input" value={title} placeholder="Ex.: Contestação — processo 123/26" onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Dossier (opcional)" htmlFor="pz-case">
                  <select id="pz-case" className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                    <option value="">Sem dossier</option>
                    {(cases ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ref} · {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div>
                  <Button variant="primary" icon={CalendarPlus} onClick={() => void addToAgenda()}>
                    Agendar
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
