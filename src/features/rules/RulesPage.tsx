import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Ellipsis, Pencil, Plus, RefreshCw, Sparkles, Trash2, Workflow } from 'lucide-react';
import { OFFICE_RULE_EXAMPLES, deadlineSpec, describeConditions, ruleApplies } from '../../engine/officeRules';
import { phaseLabel } from '../../engine/phases';
import { db, newOfficeRule, newOfficeRuleTask } from '../../lib/db';
import {
  addExampleRule,
  applyOfficeRules,
  deleteOfficeRule,
  describeDrift,
  duplicateOfficeRule,
  isRuleTarget,
  loadOfficeDrift,
  officeDrift,
  saveOfficeRule,
  setOfficeRuleEnabled,
  useOfficeRules,
  type ApplySummary,
} from '../../lib/officeRules';
import type { OfficeRuleRecord } from '../../lib/types';
import { cx } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty, Menu, useConfirm } from '../../components/ui';
import { RuleSheet } from './RuleSheet';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeApply(s: ApplySummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(`+${s.added.length} ${s.added.length === 1 ? 'tarefa' : 'tarefas'}`);
  if (s.removed.length) parts.push(`−${s.removed.length} ${s.removed.length === 1 ? 'retirada' : 'retiradas'}`);
  if (s.obsoleted.length) parts.push(`${s.obsoleted.length} a rever`);
  const other = s.updated - s.reactivated.length;
  if (other > 0) parts.push(`${other} ${other === 1 ? 'atualizada' : 'atualizadas'}`);
  if (s.reactivated.length) parts.push(`${s.reactivated.length} ${s.reactivated.length === 1 ? 'reativada' : 'reativadas'}`);
  return parts.join(' · ');
}

/** Regras do escritório: tarefas próprias geradas a partir do questionário, aplicadas aos dossiers em curso. */
export function RulesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const search = useSearch();
  const [, navigate] = useLocation();
  const rules = useOfficeRules();
  const cases = useLiveQuery(() => db.cases.toArray(), []);
  const tasks = useLiveQuery(async () => {
    const ids = (await db.cases.toArray()).filter(isRuleTarget).map((c) => c.id);
    return ids.length ? db.tasks.where('caseId').anyOf(ids).toArray() : [];
  }, []);
  const [editing, setEditing] = useState<{ rule: OfficeRuleRecord; isNew: boolean } | null>(null);
  const [applying, setApplying] = useState(false);

  // ?regra=<id>: abre a regra (ligação a partir de uma tarefa da checklist) uma só vez e limpa o endereço.
  const opened = useRef('');
  useEffect(() => {
    const id = new URLSearchParams(search).get('regra') ?? '';
    if (!id || id === opened.current || !rules) return;
    opened.current = id;
    const r = rules.find((x) => x.id === id);
    if (r) setEditing({ rule: r, isNew: false });
    navigate('/regras?', { replace: true });
  }, [search, rules, navigate]);

  const targets = useMemo(() => (cases ?? []).filter(isRuleTarget), [cases]);
  const drift = useMemo(() => (rules && cases && tasks ? officeDrift(cases, tasks, rules) : null), [rules, cases, tasks]);
  const list = useMemo(() => [...(rules ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt')), [rules]);
  const enabled = list.filter((r) => r.enabled).length;

  const apply = async () => {
    const d = await loadOfficeDrift();
    if (!d.caseIds.length) {
      toast({ tone: 'info', title: 'Os dossiers em curso já estão de acordo com as regras' });
      return;
    }
    const ok = await confirm({
      title: 'Aplicar as regras aos dossiers em curso?',
      message: `${plural(d.caseIds.length, 'dossier', 'dossiers')}: ${describeDrift(d)}. As tarefas com trabalho nunca são apagadas, e fica registado no histórico de cada dossier.`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    setApplying(true);
    try {
      const s = await applyOfficeRules();
      toast({ tone: 'success', title: `Regras aplicadas a ${plural(s.changedCases, 'dossier', 'dossiers')}`, description: describeApply(s) || undefined });
    } finally {
      setApplying(false);
    }
  };

  const save = async (r: OfficeRuleRecord) => {
    const wasNew = editing?.isNew ?? false;
    await saveOfficeRule(r);
    setEditing(null);
    toast({
      tone: 'success',
      title: wasNew ? 'Regra criada' : 'Regra guardada',
      description: r.enabled ? 'Aplique aos dossiers em curso para atualizar as checklists.' : 'A regra está desativada: não gera tarefas.',
      ...(r.enabled ? { action: { label: 'Aplicar', onClick: () => void apply() } } : {}),
    });
  };

  const remove = async (r: OfficeRuleRecord) => {
    const ok = await confirm({
      title: `Remover a regra «${r.name}»?`,
      message: 'Nos dossiers, nada muda até aplicar as regras: aí, as tarefas desta regra ainda por começar saem da checklist e as que já têm trabalho ficam «a rever».',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await deleteOfficeRule(r);
    setEditing(null);
  };

  const fromExample = async (i: number) => {
    const r = await addExampleRule(i);
    toast({ tone: 'success', title: `Exemplo acrescentado: «${r.name}»`, description: 'Adapte-o à prática do escritório antes de aplicar.' });
    setEditing({ rule: r, isNew: false });
  };

  const examplesMenu = OFFICE_RULE_EXAMPLES.map((ex, i) => ({ label: ex.name, description: describeConditions(ex), icon: Sparkles, onSelect: () => void fromExample(i) }));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Workflow size={14} aria-hidden /> Escritório
          </div>
          <h1>Regras do escritório</h1>
          <p className="lede">
            Tarefas próprias do escritório, geradas a partir das respostas do questionário — com fase, prazo e documentos — ao lado das tarefas da biblioteca. Conteúdo da responsabilidade da equipa: validar antes de usar.
          </p>
        </div>
        <div className="page-actions">
          {list.length > 0 && (
            <Menu
              ariaLabel="Exemplos de regras"
              items={examplesMenu}
              button={(p) => (
                <button type="button" className="btn" {...p}>
                  <Sparkles aria-hidden /> Exemplos
                </button>
              )}
            />
          )}
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ rule: newOfficeRule({ tasks: [newOfficeRuleTask()] }), isNew: true })}>
            Nova regra
          </Button>
        </div>
      </div>

      {drift && drift.caseIds.length > 0 && (
        <div className="callout warn rules-drift" role="status" data-testid="rules-drift">
          <RefreshCw aria-hidden />
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <strong>Há alterações por aplicar em {plural(drift.caseIds.length, 'dossier em curso', 'dossiers em curso')}</strong> — {describeDrift(drift)}.
            </div>
            <div>
              <Button size="sm" variant="primary" icon={RefreshCw} disabled={applying} onClick={() => void apply()}>
                Aplicar aos dossiers
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHead
          icon={Workflow}
          title={list.length === 0 ? 'Regras próprias' : list.length === 1 ? '1 regra' : `${list.length} regras`}
          subtitle={list.length ? `${enabled} ${enabled === 1 ? 'ativa' : 'ativas'} · valem para os dossiers em curso e para os novos` : 'Comece por um exemplo ou crie uma regra nova'}
        />
        <div className="card-body">
          {rules && list.length === 0 ? (
            <Empty
              icon={Workflow}
              title="Sem regras do escritório"
              text="Crie regras para as práticas da casa — «quando há contas bancárias, pedir extratos», «em conflito, rever a estratégia com o sócio» — e a checklist de cada dossier passa a incluí-las."
              action={
                <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                  {OFFICE_RULE_EXAMPLES.map((ex, i) => (
                    <Button key={ex.name} size="sm" icon={Sparkles} onClick={() => void fromExample(i)}>
                      {ex.name}
                    </Button>
                  ))}
                </div>
              }
            />
          ) : (
            <ul className="rule-list">
              {list.map((r) => {
                const applies = targets.filter((c) => ruleApplies(r, c.answers)).length;
                return (
                  <li key={r.id} className={cx('rule-item', !r.enabled && 'off')} data-testid="rule-item">
                    <div className="rule-item-main">
                      <div className="rule-item-head">
                        <button type="button" className="rule-name" onClick={() => setEditing({ rule: r, isNew: false })}>
                          {r.name}
                        </button>
                        {!r.enabled && <span className="badge outline">Desativada</span>}
                      </div>
                      <p className="small muted">
                        <span className="subtle">Quando:</span> {describeConditions(r)}
                      </p>
                      <ul className="rule-item-tasks">
                        {r.tasks.map((t) => {
                          const due = deadlineSpec(t.deadline);
                          return (
                            <li key={t.key}>
                              <span className="badge">{phaseLabel(t.phase)}</span>
                              <span>{t.title}</span>
                              {t.critical && <span className="badge critical">Crítica</span>}
                              {due && <span className="tiny subtle">{due.label.replace(' (regra do escritório)', '')}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="rule-item-side">
                      <span className="tiny subtle tabular">
                        {r.enabled ? `Aplica-se a ${applies} de ${targets.length}` : `Aplicar-se-ia a ${applies} de ${targets.length}`}
                      </span>
                      <label className="checkbox small">
                        <input type="checkbox" role="switch" checked={r.enabled} onChange={(e) => void setOfficeRuleEnabled(r, e.target.checked)} aria-label={`Regra ativa: ${r.name}`} />
                        Ativa
                      </label>
                      <Menu
                        ariaLabel={`Ações da regra ${r.name}`}
                        items={[
                          { label: 'Editar', icon: Pencil, onSelect: () => setEditing({ rule: r, isNew: false }) },
                          {
                            label: 'Duplicar',
                            description: 'A cópia fica desativada',
                            icon: Copy,
                            onSelect: () =>
                              void duplicateOfficeRule(r).then((copy) => {
                                toast({ tone: 'success', title: 'Regra duplicada', description: copy.name });
                              }),
                          },
                          { label: 'Remover', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => void remove(r) },
                        ]}
                        button={(p) => (
                          <button type="button" className="btn ghost sm icon" {...p}>
                            <Ellipsis aria-hidden />
                          </button>
                        )}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <RuleSheet
        rule={editing?.rule ?? null}
        isNew={editing?.isNew ?? false}
        cases={cases ?? []}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={(r) => void remove(r)}
      />
    </div>
  );
}
