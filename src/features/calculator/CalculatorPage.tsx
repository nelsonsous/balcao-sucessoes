import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Eraser, FolderInput, Printer, Save, Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';
import { emptyCalcInput, newPerson, type CalcInput } from '../../engine/succession';
import { updateCase } from '../../lib/actions';
import { calcInputFromCase, writeCalc } from '../../lib/calcImport';
import { db } from '../../lib/db';
import { useToast } from '../../components/Toast';
import { Button, Menu } from '../../components/ui';
import { SuccessionCalculator } from './SuccessionCalculator';

const DRAFT_KEY = 'bs-calc-draft';

const spouse = (name = '') => ({ present: true, name, regime: 'comunhao_adquiridos' as const });
const P = newPerson;

export const CALC_EXAMPLES: Array<{ label: string; description: string; build: () => CalcInput }> = [
  {
    label: 'Cônjuge e 2 filhos',
    description: 'Partilha por cabeça: ⅓ para cada; legítima ⅔',
    build: () => ({ ...emptyCalcInput(), deceasedName: 'Exemplo', spouse: spouse('Cônjuge'), children: [P({ name: 'Filho A' }), P({ name: 'Filha B' })] }),
  },
  {
    label: 'Cônjuge e 5 filhos',
    description: 'O cônjuge tem ¼ garantido (art. 2139.º)',
    build: () => ({
      ...emptyCalcInput(),
      deceasedName: 'Exemplo',
      spouse: spouse('Cônjuge'),
      children: ['A', 'B', 'C', 'D', 'E'].map((n) => P({ name: `Filho ${n}` })),
    }),
  },
  {
    label: 'Filho pré-falecido com netos',
    description: 'Direito de representação por estirpes',
    build: () => ({
      ...emptyCalcInput(),
      deceasedName: 'Exemplo',
      spouse: spouse('Cônjuge'),
      children: [P({ name: 'Filho A' }), P({ name: 'Filho B', status: 'predefunto', descendants: [P({ name: 'Neta B1' }), P({ name: 'Neto B2' })] })],
    }),
  },
  {
    label: 'Cônjuge e pais',
    description: '⅔ para o cônjuge, ⅓ para os ascendentes',
    build: () => ({ ...emptyCalcInput(), deceasedName: 'Exemplo', spouse: spouse('Cônjuge'), parents: 2 }),
  },
  {
    label: 'Irmãos germanos e unilaterais',
    description: 'O germano recebe o dobro (art. 2146.º)',
    build: () => ({
      ...emptyCalcInput(),
      deceasedName: 'Exemplo',
      siblings: [P({ name: 'Irmã (germana)', kind: 'germano' }), P({ name: 'Irmão (unilateral)', kind: 'unilateral' }), P({ name: 'Irmã (unilateral)', kind: 'unilateral' })],
      values: { own: 150_000, common: null, debts: 10_000, donations: null, testamentary: null },
    }),
  },
];

function loadDraft(): CalcInput {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyCalcInput(), ...(JSON.parse(raw) as CalcInput) };
  } catch {
    /* ignora */
  }
  return CALC_EXAMPLES[0]!.build();
}

export function CalculatorPage() {
  const [input, setInput] = useState<CalcInput>(loadDraft);
  const [, navigate] = useLocation();
  const toast = useToast();
  const cases = useLiveQuery(
    async () => (await db.cases.filter((c) => c.stage === 'ativo' || c.stage === 'suspenso').toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    } catch {
      /* ignora */
    }
  }, [input]);

  async function importFrom(caseId: string) {
    const c = await db.cases.get(caseId);
    if (!c) return;
    const { input: next, notes } = await calcInputFromCase(c);
    setInput(next);
    toast({ tone: 'success', title: `Dados importados de ${c.name}`, description: notes.length ? `${notes.length} ponto(s) a rever na fundamentação do dossier.` : undefined });
  }

  async function saveTo(caseId: string) {
    const c = await db.cases.get(caseId);
    if (!c) return;
    await updateCase(c.id, { calcJson: writeCalc(input) }, 'Simulação de quotas guardada a partir da calculadora');
    toast({ tone: 'success', title: 'Simulação guardada no dossier', action: { label: 'Abrir', onClick: () => navigate(`/dossiers/${c.id}/quotas`) } });
  }

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <div className="eyebrow">
            <Calculator size={14} aria-hidden /> Código Civil, arts. 2131.º e ss.
          </div>
          <h1>Calculadora sucessória</h1>
          <p className="lede">Quotas da sucessão legítima, legítima e quota disponível — com representação, meação e árvore genealógica.</p>
        </div>
        <div className="page-actions">
          <Menu
            ariaLabel="Exemplos"
            align="right"
            items={CALC_EXAMPLES.map((e) => ({ label: e.label, description: e.description, icon: Sparkles, onSelect: () => setInput(e.build()) }))}
            button={(p) => (
              <button type="button" className="btn" {...p}>
                <Sparkles aria-hidden /> Exemplos
              </button>
            )}
          />
          {(cases?.length ?? 0) > 0 && (
            <>
              <Menu
                ariaLabel="Importar de um dossier"
                items={(cases ?? []).map((c) => ({ label: c.name, description: c.ref, icon: FolderInput, onSelect: () => void importFrom(c.id) }))}
                button={(p) => (
                  <button type="button" className="btn" {...p}>
                    <FolderInput aria-hidden /> Importar dossier
                  </button>
                )}
              />
              <Menu
                ariaLabel="Guardar num dossier"
                items={(cases ?? []).map((c) => ({ label: c.name, description: c.ref, icon: Save, onSelect: () => void saveTo(c.id) }))}
                button={(p) => (
                  <button type="button" className="btn" {...p}>
                    <Save aria-hidden /> Guardar em…
                  </button>
                )}
              />
            </>
          )}
          <Button icon={Printer} onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button variant="ghost" icon={Eraser} onClick={() => setInput(emptyCalcInput())}>
            Limpar
          </Button>
        </div>
      </div>
      <SuccessionCalculator value={input} onChange={setInput} />
    </div>
  );
}
