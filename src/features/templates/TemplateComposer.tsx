import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, FileDown, FileText, Mail, Pencil, Printer, Save, TriangleAlert } from 'lucide-react';
import { db, newDocument } from '../../lib/db';
import { attachFile, docKey } from '../../lib/documents';
import { DOCX_MIME, buildDocx, type DocBlock, type DocRun } from '../../lib/docx';
import { baseContext, caseContext } from '../../lib/templateContext';
import { logActivity } from '../../lib/db';
import { cx, downloadFile, formatDate, todayIso, uid } from '../../lib/utils';
import {
  LANGUAGE_LABELS,
  blocksToText,
  fillTemplate,
  parseBlocks,
  placeholderLabel,
  type TemplateContext,
  type TemplateDef,
} from '../../engine/templates';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

export interface ComposerState {
  template: TemplateDef;
  caseId?: string;
}

function Runs({ runs }: { runs: DocRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: ReactNode = r.text;
        if (r.bold) node = <strong>{node}</strong>;
        if (r.missing) node = <mark>{node}</mark>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

export function DocPreview({ blocks }: { blocks: DocBlock[] }) {
  const out: ReactNode[] = [];
  let bullets: DocBlock[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`}>
        {bullets.map((b, i) => (
          <li key={i}>
            <Runs runs={b.lines[0] ?? []} />
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === 'li') {
      bullets.push(b);
      return;
    }
    flushBullets();
    const content = b.lines.map((l, j) => (
      <span key={j}>
        {j > 0 && <br />}
        <Runs runs={l} />
      </span>
    ));
    if (b.type === 'h1') out.push(<h1 key={i}>{content}</h1>);
    else if (b.type === 'h2') out.push(<h2 key={i}>{content}</h2>);
    else out.push(<p key={i}>{content}</p>);
  });
  flushBullets();
  return <div className="paper">{out}</div>;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);

export function TemplateComposer({ state, onClose }: { state: ComposerState | null; onClose: () => void }) {
  const toast = useToast();
  const cases = useLiveQuery(
    async () => (await db.cases.filter((c) => c.stage !== 'arquivado').toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [],
  );
  const [caseId, setCaseId] = useState('');
  const [ctx, setCtx] = useState<TemplateContext>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [params, setParams] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const t = state?.template;

  useEffect(() => {
    if (!state) return;
    setCaseId(state.caseId ?? '');
    setParams({});
    setEdited(null);
    setEditing(false);
  }, [state]);

  useEffect(() => {
    if (!t) return;
    let cancelled = false;
    void (async () => {
      const c = caseId ? await db.cases.get(caseId) : undefined;
      if (c) {
        const r = await caseContext(c, t.language);
        if (cancelled) return;
        setCtx(r.ctx);
        setSuggestions(r.suggestions);
        // Parâmetros com valor natural no dossier (ex.: data da próxima escritura).
        setParams((p) => {
          const next = { ...p };
          for (const def of t.params ?? []) {
            if (next[def.key]) continue;
            const fromCtx = r.ctx[def.key];
            const fromSuggest = def.suggest ? r.suggestions[def.suggest]?.[0] : undefined;
            if (fromCtx) next[def.key] = fromCtx;
            else if (fromSuggest) next[def.key] = fromSuggest;
          }
          return next;
        });
      } else {
        const base = await baseContext(t.language);
        if (cancelled) return;
        setCtx(base);
        setSuggestions({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, t]);

  const merged = useMemo(() => {
    const out = { ...ctx };
    for (const [k, v] of Object.entries(params)) if (v.trim()) out[k] = v;
    return out;
  }, [ctx, params]);

  const paramLabels = useMemo(() => Object.fromEntries((t?.params ?? []).map((p) => [p.key, p.label])), [t]);
  const filled = useMemo(() => (t ? fillTemplate(t.body, merged, paramLabels) : { text: '', missing: [] }), [t, merged, paramLabels]);
  const subject = useMemo(() => (t ? fillTemplate(t.subject, merged, paramLabels).text.replace(/⟦/g, '[').replace(/⟧/g, ']') : ''), [t, merged]);
  const text = edited ?? filled.text;
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const missing = useMemo(() => {
    const set = new Set<string>();
    blocks.forEach((b) => b.lines.forEach((l) => l.forEach((r) => r.missing && set.add(r.text))));
    return [...set];
  }, [blocks]);
  const selectedCase = (cases ?? []).find((c) => c.id === caseId);

  useEffect(() => {
    if (!printing) return;
    const done = () => {
      document.body.classList.remove('print-doc-mode');
      setPrinting(false);
    };
    document.body.classList.add('print-doc-mode');
    window.addEventListener('afterprint', done, { once: true });
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('print-doc-mode');
    };
  }, [printing]);

  if (!state || !t) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const plain = blocksToText(blocks);
  const fileBase = `${slug(t.title)}${selectedCase ? `-${slug(selectedCase.ref)}` : ''}-${todayIso()}`;
  const docxBytes = () => buildDocx(blocks, { title: subject || t.title });

  async function copy() {
    try {
      await navigator.clipboard.writeText(plain);
      toast({ tone: 'success', title: 'Texto copiado' });
    } catch {
      toast({ tone: 'error', title: 'Não foi possível copiar', description: 'Selecione o texto na pré-visualização e copie manualmente.' });
    }
  }

  async function saveToCase() {
    if (!selectedCase) return;
    const name = `${t!.title} — ${formatDate(todayIso())}`;
    const doc = newDocument(selectedCase.id, { name, category: 'minutas', source: 'minuta', status: 'recebido', key: `${docKey(name)}|${uid()}` });
    await db.documents.add(doc);
    const bytes = docxBytes();
    await attachFile(doc, new Blob([bytes as BlobPart], { type: DOCX_MIME }), `${fileBase}.docx`);
    await logActivity(selectedCase.id, 'documento', `Minuta gerada: ${t!.title}`);
    toast({ tone: 'success', title: 'Minuta guardada no dossier', description: 'Disponível no separador Documentos.' });
  }

  const emailHref =
    t.email && selectedCase?.client.email
      ? `mailto:${encodeURIComponent(selectedCase.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`
      : '';

  return (
    <Sheet
      open
      onClose={onClose}
      title={t.title}
      subtitle={`${t.category} · ${LANGUAGE_LABELS[t.language]}${t.builtin ? ' · minuta-base' : ' · minuta do escritório'}`}
      icon={FileText}
      footer={
        <>
          <Button icon={Copy} onClick={() => void copy()}>
            Copiar
          </Button>
          <Button icon={FileDown} onClick={() => downloadFile(`${fileBase}.docx`, docxBytes() as BlobPart, DOCX_MIME)}>
            Word
          </Button>
          <Button icon={Printer} onClick={() => setPrinting(true)}>
            PDF
          </Button>
          {emailHref && (
            <a className="btn" href={emailHref}>
              <Mail aria-hidden /> Email
            </a>
          )}
          <span className="spacer" />
          <Button variant="primary" icon={Save} disabled={!selectedCase} onClick={() => void saveToCase()} title={selectedCase ? undefined : 'Escolha um dossier'}>
            Guardar no dossier
          </Button>
        </>
      }
    >
      <div className="composer">
        <div className="composer-controls">
          <Field label="Dossier" htmlFor="cmp-case">
            <select id="cmp-case" className="select" value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={Boolean(state.caseId)}>
              <option value="">Sem dossier (preencher à mão)</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ref} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          {(t.params ?? []).map((p) => (
            <Field key={p.key} label={p.label} htmlFor={`prm-${p.key}`}>
              <input
                id={`prm-${p.key}`}
                className="input"
                list={p.suggest ? `sug-${p.key}` : undefined}
                placeholder={p.placeholder}
                value={params[p.key] ?? ''}
                onChange={(e) => {
                  setEdited(null);
                  setParams((x) => ({ ...x, [p.key]: e.target.value }));
                }}
              />
              {p.suggest && (
                <datalist id={`sug-${p.key}`}>
                  {(suggestions[p.suggest] ?? []).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </Field>
          ))}
          {t.subject && (
            <div className="field">
              <span className="field-label">Assunto</span>
              <div className="subject-line">{subject}</div>
            </div>
          )}
          {missing.length > 0 ? (
            <div className="callout warn">
              <TriangleAlert aria-hidden />
              <div>
                <strong>{missing.length} campo(s) por preencher</strong> — aparecem realçados. Complete os dados do dossier ou edite o texto.
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {missing.map((m) => (
                    <span key={m} className="tag">
                      {m.replace(/^\[|\]$/g, '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="tiny subtle">Todos os campos preenchidos. Reveja sempre o texto antes de enviar.</p>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <Button size="sm" variant={editing ? 'soft' : 'default'} icon={Pencil} onClick={() => {
              if (!editing && edited === null) setEdited(filled.text);
              setEditing((v) => !v);
            }}>
              {editing ? 'Ver pré-visualização' : 'Editar texto'}
            </Button>
            {edited !== null && (
              <Button size="sm" variant="ghost" onClick={() => setEdited(null)}>
                Repor o modelo
              </Button>
            )}
          </div>
          <p className="tiny subtle">
            Formatação: <code># título</code>, <code>## secção</code>, <code>- item</code>, <code>**negrito**</code>.
            {filled.missing.length > 0 && ` Campos em falta: ${filled.missing.map((k) => placeholderLabel(k, paramLabels)).join(', ')}.`}
          </p>
        </div>
        <div className="composer-preview">
          {editing ? (
            <textarea className="textarea composer-edit" value={text} onChange={(e) => setEdited(e.target.value)} aria-label="Texto da minuta" />
          ) : (
            <DocPreview blocks={blocks} />
          )}
        </div>
      </div>
      {printing &&
        createPortal(
          <div className={cx('print-doc')}>
            <DocPreview blocks={blocks} />
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
