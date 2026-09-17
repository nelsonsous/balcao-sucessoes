import { useMemo, useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useSearch } from 'wouter';
import { Copy, FilePlus2, FileText, Mail, Pencil, Search, Trash2, Wand2 } from 'lucide-react';
import { db } from '../../lib/db';
import type { TemplateLanguage, TemplateRecord } from '../../lib/types';
import { normalize, nowIso, uid } from '../../lib/utils';
import {
  BUILTIN_TEMPLATES,
  LANGUAGE_LABELS,
  PLACEHOLDERS,
  TEMPLATE_CATEGORIES,
  fillTemplate,
  parseBlocks,
  usedPlaceholders,
  type TemplateDef,
} from '../../engine/templates';
import { useToast } from '../../components/Toast';
import { Button, Card, Empty, Field, Segmented, Sheet, useConfirm } from '../../components/ui';
import { DocPreview, TemplateComposer, type ComposerState } from './TemplateComposer';

const toDef = (r: TemplateRecord): TemplateDef => ({ ...r, builtin: false, email: /^email/i.test(r.title) || r.category === 'Cliente' });

const SAMPLE: Record<string, string> = {
  hoje: '17 de setembro de 2026',
  'escritorio.nome': 'Escritório Exemplo',
  'escritorio.local': 'Lisboa',
  'responsavel.nome': 'Ana Marques',
  'dossier.ref': 'BS-2026-001',
  'dossier.nome': 'Sucessão Exemplo',
  'falecido.nome': 'Maria Exemplo',
  'falecido.data_obito': '4 de julho de 2026',
  'cliente.nome': 'João Exemplo',
  'lista.documentos_em_falta': '- Certidão de óbito\n- Caderneta predial',
};

export function TemplatesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const custom = useLiveQuery(() => db.templates.toArray(), []);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<'todas' | TemplateLanguage>('todas');
  const [category, setCategory] = useState('');
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [editing, setEditing] = useState<TemplateRecord | null>(null);

  const all = useMemo(() => [...(custom ?? []).map(toDef), ...BUILTIN_TEMPLATES], [custom]);
  // Ligação direta (paleta de comandos): /minutas?usar=<id> abre o compositor.
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(search).get('usar');
    if (!id || custom === undefined) return;
    const t = all.find((x) => x.id === id);
    if (t) setComposer({ template: t });
    navigate('/minutas', { replace: true });
  }, [search, all, custom, navigate]);
  const visible = all.filter(
    (t) =>
      (lang === 'todas' || t.language === lang) &&
      (!category || t.category === category) &&
      (!q || normalize(`${t.title} ${t.description} ${t.category}`).includes(normalize(q))),
  );

  const duplicate = async (t: TemplateDef) => {
    const ts = nowIso();
    const rec: TemplateRecord = {
      id: uid(),
      title: `${t.title} (cópia)`,
      category: t.category,
      language: t.language,
      description: t.description,
      subject: t.subject,
      body: t.body,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.templates.add(rec);
    setEditing(rec);
    toast({ tone: 'success', title: 'Minuta duplicada', description: 'Ajuste-a ao estilo do escritório.' });
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Wand2 size={14} aria-hidden /> Repetir menos
          </div>
          <h1>Minutas</h1>
          <p className="lede">Cartas, emails e procurações preenchidos com os dados do dossier — em português, francês e inglês.</p>
        </div>
        <div className="page-actions">
          <Button
            variant="primary"
            icon={FilePlus2}
            onClick={() => {
              const ts = nowIso();
              setEditing({ id: '', title: '', category: 'Cliente', language: 'pt', description: '', subject: '', body: '', createdAt: ts, updatedAt: ts });
            }}
          >
            Nova minuta
          </Button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ flex: '1 1 240px', maxWidth: 340 }}>
          <Search aria-hidden />
          <input className="input" placeholder="Procurar minuta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar minuta" />
        </div>
        <select className="select" style={{ width: 'auto' }} aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <Segmented<'todas' | TemplateLanguage>
          label="Língua"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'pt', label: 'PT' },
            { value: 'fr', label: 'FR' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <Card>
          <Empty icon={FileText} title="Nenhuma minuta encontrada" />
        </Card>
      ) : (
        <div className="template-grid">
          {visible.map((t) => (
            <Card key={t.id} className="template-card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span className="icon-tile brand">{t.email ? <Mail aria-hidden /> : <FileText aria-hidden />}</span>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge outline">{t.language.toUpperCase()}</span>
                  <span className={t.builtin ? 'badge' : 'badge brand'}>{t.builtin ? 'Base' : 'Do escritório'}</span>
                </div>
              </div>
              <div>
                <div className="tiny subtle strong">{t.category.toUpperCase()}</div>
                <h3 className="template-title">{t.title}</h3>
                <p className="small muted">{t.description}</p>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 'auto' }}>
                <Button size="sm" variant="primary" icon={Wand2} onClick={() => setComposer({ template: t })}>
                  Usar
                </Button>
                <Button size="sm" icon={Copy} onClick={() => void duplicate(t)}>
                  Duplicar
                </Button>
                {!t.builtin && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon={Pencil}
                      aria-label="Editar minuta"
                      onClick={() => setEditing((custom ?? []).find((r) => r.id === t.id) ?? null)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon={Trash2}
                      aria-label="Eliminar minuta"
                      onClick={async () => {
                        if (await confirm({ title: `Eliminar “${t.title}”?`, confirmLabel: 'Eliminar', danger: true })) await db.templates.delete(t.id);
                      }}
                    />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="footnote">
        As minutas-base são pontos de partida — adapte-as ao caso e ao estilo do escritório antes de enviar ou assinar.
      </p>

      <TemplateComposer state={composer} onClose={() => setComposer(null)} />
      <TemplateEditor
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => toast({ tone: 'success', title: 'Minuta guardada' })}
      />
    </div>
  );
}

function TemplateEditor({ record, onClose, onSaved }: { record: TemplateRecord | null; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState<TemplateRecord | null>(record);
  const area = useRef<HTMLTextAreaElement>(null);
  const [lastRecord, setLastRecord] = useState(record);
  if (record !== lastRecord) {
    setLastRecord(record);
    setR(record);
  }
  if (!r) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const set = (patch: Partial<TemplateRecord>) => setR((x) => (x ? { ...x, ...patch } : x));
  const unknown = usedPlaceholders(`${r.subject}\n${r.body}`).filter((k) => !PLACEHOLDERS.some((p) => p.key === k));

  const insert = (key: string) => {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return set({ body: r.body + token });
    const start = el.selectionStart ?? r.body.length;
    const end = el.selectionEnd ?? start;
    const body = r.body.slice(0, start) + token + r.body.slice(end);
    set({ body });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  async function save() {
    if (!r || !r.title.trim() || !r.body.trim()) return;
    const rec = { ...r, id: r.id || uid(), title: r.title.trim(), updatedAt: nowIso() };
    await db.templates.put(rec);
    onSaved();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={r.id ? 'Editar minuta' : 'Nova minuta'}
      subtitle="Use campos entre chavetas duplas — são preenchidos com os dados do dossier."
      icon={FilePlus2}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!r.title.trim() || !r.body.trim()} onClick={() => void save()}>
            Guardar minuta
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <Field label="Título *" htmlFor="te-title" className="span-2">
            <input id="te-title" className="input" data-autofocus value={r.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Categoria" htmlFor="te-cat">
            <select id="te-cat" className="select" value={r.category} onChange={(e) => set({ category: e.target.value })}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Língua" htmlFor="te-lang" hint="Define o formato das datas e valores.">
            <select id="te-lang" className="select" value={r.language} onChange={(e) => set({ language: e.target.value as TemplateLanguage })}>
              {(Object.keys(LANGUAGE_LABELS) as TemplateLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descrição" htmlFor="te-desc" className="span-2">
            <input id="te-desc" className="input" value={r.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Assunto" htmlFor="te-subj" className="span-2">
            <input id="te-subj" className="input" value={r.subject} onChange={(e) => set({ subject: e.target.value })} />
          </Field>
        </div>
        <Field label="Texto *" htmlFor="te-body" hint="Formatação: # título · ## secção · - item · **negrito**" error={unknown.length ? `Campos desconhecidos: ${unknown.join(', ')}` : undefined}>
          <textarea id="te-body" ref={area} className="textarea" style={{ minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }} value={r.body} onChange={(e) => set({ body: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">Inserir campo</span>
          <div className="placeholder-palette">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" className="tag placeholder-chip" onClick={() => insert(p.key)} title={`{{${p.key}}}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Pré-visualização (dados de exemplo)</span>
          <DocPreview blocks={parseBlocks(fillTemplate(r.body, SAMPLE).text)} />
        </div>
      </div>
    </Sheet>
  );
}
