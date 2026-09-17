import { useEffect, useState } from 'react';
import { Copy, Download, Eye, Mail, Send } from 'lucide-react';
import { db, useSettings } from '../../lib/db';
import { buildDocumentRequest, mailtoLink, type RequestTarget } from '../../lib/docRequests';
import { formatBytes, markRequested, openAttachment } from '../../lib/documents';
import type { CaseRecord, DocumentRecord } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

type PreviewKind = 'pdf' | 'image' | 'text' | 'other' | 'missing' | 'loading';

export const canPreview = (type: string): boolean => type === 'application/pdf' || type.startsWith('image/') || type.startsWith('text/') || type === 'application/json';

/** Pré-visualização do anexo (PDF, imagem ou texto) sem sair da aplicação. */
export function PreviewSheet({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<PreviewKind>('loading');

  useEffect(() => {
    let objectUrl = '';
    let alive = true;
    setUrl('');
    setText('');
    setKind('loading');
    if (!doc?.fileId) return;
    void db.files.get(doc.fileId).then(async (f) => {
      if (!alive) return;
      if (!f) {
        setKind('missing');
        return;
      }
      const type = f.type || doc.fileType;
      if (type.startsWith('text/') || type === 'application/json') {
        setText((await f.blob.text()).slice(0, 20_000));
        if (alive) setKind('text');
        return;
      }
      objectUrl = URL.createObjectURL(f.blob);
      setUrl(objectUrl);
      setKind(type === 'application/pdf' ? 'pdf' : type.startsWith('image/') ? 'image' : 'other');
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.id, doc?.fileId, doc?.fileType]);

  return (
    <Sheet
      open={Boolean(doc)}
      onClose={onClose}
      variant="modal"
      title={doc?.fileName || 'Pré-visualização'}
      subtitle={doc ? `${doc.name} · ${formatBytes(doc.fileSize)} · ${doc.fileType || 'ficheiro'}` : undefined}
      icon={Eye}
      footer={
        <>
          <span className="spacer" />
          <Button icon={Download} onClick={() => doc && void openAttachment(doc, 'download')}>
            Descarregar
          </Button>
          <Button variant="primary" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="preview-box" data-kind={kind}>
        {kind === 'loading' && <p className="small subtle">A carregar…</p>}
        {kind === 'pdf' && url && <iframe src={url} title={doc?.fileName ?? 'PDF'} className="preview-frame" />}
        {kind === 'image' && url && <img src={url} alt={doc?.name ?? 'Anexo'} className="preview-img" />}
        {kind === 'text' && <pre className="preview-text">{text}</pre>}
        {kind === 'other' && <p className="small subtle">Este tipo de ficheiro não tem pré-visualização na aplicação — descarregue-o para o abrir.</p>}
        {kind === 'missing' && <p className="small text-danger">O anexo já não existe neste dispositivo.</p>}
      </div>
    </Sheet>
  );
}

/** Pedido de documentos a um interessado: escolher os documentos, ver o texto, copiar/enviar e marcar como pedidos. */
export function RequestSheet({ c, target, onClose }: { c: CaseRecord; target: RequestTarget | null; onClose: () => void }) {
  const settings = useSettings();
  const toast = useToast();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setChosen(new Set((target?.docs ?? []).map((d) => d.id)));
    setUntil('');
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const docs = target.docs.filter((d) => chosen.has(d.id));
  const { subject, body } = buildDocumentRequest({ target, docs, deceasedName: c.deceased.name, firmName: settings.firmName, userName: settings.userName, ...(until ? { until } : {}) });
  const full = `${subject}\n\n${body}`;
  const mailto = mailtoLink(target.email, subject, body);

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      toast({ tone: 'success', title: 'Texto do pedido copiado' });
    } catch {
      toast({ tone: 'error', title: 'Não foi possível copiar', description: 'Selecione o texto e copie manualmente.' });
    }
  }

  async function mark() {
    if (!target) return;
    setBusy(true);
    try {
      const n = await markRequested(docs, target.name);
      toast({ tone: 'success', title: `${docs.length} documento(s) marcado(s) como pedidos`, description: `a ${target.name}${n < docs.length ? ` · ${docs.length - n} já estava(m) pedido(s)` : ''}` });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Pedir documentos a ${target.name}`}
      subtitle={target.isClient ? 'Cliente — inclui os documentos genéricos que só o cliente pode fornecer.' : 'Interessado — apenas os documentos que lhe dizem respeito.'}
      icon={Mail}
      footer={
        <>
          <Button icon={Copy} onClick={() => void copy()} disabled={!docs.length}>
            Copiar texto
          </Button>
          {mailto && (
            <a className="btn" href={mailto} aria-disabled={!docs.length}>
              <Send aria-hidden /> Abrir no e-mail
            </a>
          )}
          <span className="spacer" />
          <Button variant="primary" icon={Mail} disabled={!docs.length || busy} onClick={() => void mark()}>
            Marcar como pedidos
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend className="small subtle">Documentos a pedir</legend>
          {target.docs.map((d) => (
            <label key={d.id} className="checkbox">
              <input
                type="checkbox"
                checked={chosen.has(d.id)}
                onChange={(e) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    return next;
                  })
                }
              />
              <span>
                {d.name}
                {d.status === 'pedido' && <span className="tiny subtle"> · já pedido{d.requestedAt ? ` em ${formatDate(d.requestedAt)}` : ''}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <Field label="Data limite sugerida (opcional)" htmlFor="rq-until">
          <input id="rq-until" type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label="Texto do pedido" htmlFor="rq-body" hint={target.email ? `Destinatário: ${target.email}` : 'Sem e-mail registado — copie o texto, ou registe o e-mail na ficha do interessado.'}>
          <textarea id="rq-body" className="textarea" rows={12} readOnly value={full} />
        </Field>
      </div>
    </Sheet>
  );
}
