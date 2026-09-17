import { useState } from 'react';
import { Bookmark, BookmarkPlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PHASES } from '../../engine/phases';
import { useSettings } from '../../lib/db';
import type { MemberRecord } from '../../lib/types';
import { DEATH_LABELS, DUE_LABELS, EMPTY_FILTERS, HEALTH_LABELS, INTL_LABELS, PRESET_VIEWS, PRIORITY_FILTER_LABELS, STAGE_FILTER_LABELS, countActive, deleteView, presetFilters, sameFilters, saveView, type DeathFilter, type DueFilter, type Filters, type HealthFilter, type IntlFilter, type StageFilter } from '../../lib/views';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

/** Painel de filtros avançados da lista de dossiers (aplicação imediata). */
export function FiltersSheet({ open, onClose, filters, onChange, members, tags, onSaveView }: { open: boolean; onClose: () => void; filters: Filters; onChange: (f: Filters) => void; members: MemberRecord[]; tags: string[]; onSaveView: () => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const n = countActive(filters);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      subtitle={n ? `${n} filtro(s) ativo(s) — aplicados de imediato.` : 'Combine filtros; aplicam-se de imediato.'}
      icon={SlidersHorizontal}
      footer={
        <>
          <Button variant="ghost" disabled={!n && !filters.q} onClick={() => onChange({ ...EMPTY_FILTERS })}>
            Limpar filtros
          </Button>
          <span className="spacer" />
          <Button icon={BookmarkPlus} disabled={!n && !filters.q.trim()} onClick={onSaveView}>
            Guardar como vista…
          </Button>
          <Button variant="primary" onClick={onClose}>
            Ver resultados
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="form-grid">
          <Field label="Situação" htmlFor="f-stage">
            <select id="f-stage" className="select" value={filters.stage} onChange={(e) => set('stage', e.target.value as StageFilter)}>
              {(Object.keys(STAGE_FILTER_LABELS) as StageFilter[]).map((k) => (
                <option key={k} value={k}>
                  {STAGE_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Semáforo" htmlFor="f-health">
            <select id="f-health" className="select" value={filters.health} onChange={(e) => set('health', e.target.value as HealthFilter)}>
              {(Object.keys(HEALTH_LABELS) as HealthFilter[]).map((k) => (
                <option key={k} value={k}>
                  {HEALTH_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável" htmlFor="f-resp">
            <select id="f-resp" className="select" value={filters.resp} onChange={(e) => set('resp', e.target.value)}>
              <option value="">Toda a equipa</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade" htmlFor="f-prio">
            <select id="f-prio" className="select" value={filters.priority} onChange={(e) => set('priority', e.target.value as Filters['priority'])}>
              <option value="">Todas</option>
              {(Object.keys(PRIORITY_FILTER_LABELS) as Array<keyof typeof PRIORITY_FILTER_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {PRIORITY_FILTER_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Etiqueta" htmlFor="f-tag">
            <select id="f-tag" className="select" value={filters.tag} onChange={(e) => set('tag', e.target.value)}>
              <option value="">Todas</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fase atual" htmlFor="f-phase">
            <select id="f-phase" className="select" value={filters.phase} onChange={(e) => set('phase', e.target.value as Filters['phase'])}>
              <option value="">Todas</option>
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazos" htmlFor="f-due">
            <select id="f-due" className="select" value={filters.due} onChange={(e) => set('due', e.target.value as DueFilter)}>
              <option value="">Qualquer</option>
              {(Object.keys(DUE_LABELS) as Array<keyof typeof DUE_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {DUE_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data do óbito" htmlFor="f-death">
            <select id="f-death" className="select" value={filters.death} onChange={(e) => set('death', e.target.value as DeathFilter)}>
              <option value="">Qualquer</option>
              {(Object.keys(DEATH_LABELS) as Array<keyof typeof DEATH_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {DEATH_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Internacional" htmlFor="f-intl" hint="Óbito, residência, nacionalidade ou bens no estrangeiro.">
            <select id="f-intl" className="select" value={filters.intl} onChange={(e) => set('intl', e.target.value as IntlFilter)}>
              <option value="">Qualquer</option>
              {(Object.keys(INTL_LABELS) as Array<keyof typeof INTL_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {INTL_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={filters.deep} onChange={(e) => set('deep', e.target.checked)} />
          Pesquisar também em notas, contactos, documentos, interessados e bens
        </label>
        <p className="tiny subtle">Os filtros ficam no endereço da página — pode guardá-lo nos favoritos ou partilhá-lo com um colega que use a mesma cópia dos dados.</p>
      </div>
    </Sheet>
  );
}

/** Vistas: predefinidas e guardadas com nome; guardar a vista atual. */
export function ViewsSheet({ open, onClose, filters, onApply }: { open: boolean; onClose: () => void; filters: Filters; onApply: (f: Filters) => void }) {
  const settings = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = settings.savedViews;
  const canSave = Boolean(name.trim()) && (countActive(filters) > 0 || Boolean(filters.q.trim()));

  async function save() {
    setBusy(true);
    try {
      const v = await saveView(name, filters);
      toast({ tone: 'success', title: 'Vista guardada', description: v.name });
      setName('');
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível guardar', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const apply = (f: Filters) => {
    onApply(f);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Vistas" subtitle="Filtros prontos a usar e as vistas que guardou." icon={Bookmark}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small subtle">Predefinidas</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {PRESET_VIEWS.map((p) => {
              const f = presetFilters(p);
              return (
                <button key={p.id} type="button" className={`chip${sameFilters(f, filters) ? ' on' : ''}`} aria-pressed={sameFilters(f, filters)} onClick={() => apply(f)}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small subtle">Guardadas</span>
          {saved.length === 0 ? (
            <p className="small subtle">Ainda não guardou vistas. Aplique filtros e guarde-os com um nome abaixo.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} data-testid="saved-views">
              {saved.map((v) => (
                <li key={v.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <button type="button" className={`chip${sameFilters(v.filters, filters) ? ' on' : ''}`} aria-pressed={sameFilters(v.filters, filters)} onClick={() => apply(v.filters)}>
                    <Bookmark size={13} aria-hidden /> {v.name}
                  </button>
                  <span className="tiny subtle">{countActive(v.filters)} filtro(s){v.filters.q ? ` · «${v.filters.q}»` : ''}</span>
                  <span className="spacer" />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Apagar a vista ${v.name}`} onClick={() => void deleteView(v.id).then(() => toast({ title: 'Vista apagada', description: v.name }))}>
                    Apagar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="stack"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && !busy) void save();
          }}
        >
          <Field label="Guardar a vista atual" htmlFor="view-name" hint={countActive(filters) || filters.q.trim() ? `${countActive(filters)} filtro(s)${filters.q.trim() ? ` · pesquisa «${filters.q.trim()}»` : ''}` : 'Aplique primeiro filtros ou uma pesquisa.'}>
            <input id="view-name" className="input" placeholder="Ex.: Urgentes com prazo esta semana" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" variant="primary" icon={BookmarkPlus} disabled={!canSave || busy}>
              Guardar vista
            </Button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
