import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Inbox, Link2, Paperclip, Trash2 } from 'lucide-react';
import { addNote } from '../../lib/actions';
import { db } from '../../lib/db';
import { documentFromFile, formatBytes } from '../../lib/documents';
import { isActiveCase } from '../../lib/hooks';
import { itemTitle, listInbox, notifyInbox, removeInbox, toFile, type SharedItem } from '../../lib/shareInbox';
import { formatDateTime } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty } from '../../components/ui';

/** Itens partilhados para a aplicação (Web Share Target): anexar a um dossier ou ignorar. */
export function ReceivedPage() {
  const toast = useToast();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<SharedItem[] | null>(null);
  const [caseId, setCaseId] = useState('');
  const [busy, setBusy] = useState(false);
  const cases = useLiveQuery(async () => (await db.cases.filter(isActiveCase).toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')), []);

  const refresh = () =>
    listInbox()
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    void refresh();
  }, []);

  async function attach(it: SharedItem) {
    if (!caseId || it.id === undefined) return;
    setBusy(true);
    try {
      let docs = 0;
      for (const f of it.files) {
        await documentFromFile(caseId, toFile(f));
        docs += 1;
      }
      const text = [it.title, it.text, it.url].filter(Boolean).join('\n');
      if (!docs && text) await addNote(caseId, text, false);
      await removeInbox(it.id);
      notifyInbox();
      await refresh();
      toast({
        tone: 'success',
        title: docs ? `${docs} ficheiro(s) anexado(s) ao dossier` : 'Nota guardada no dossier',
        description: docs ? 'Ficam em «Documentos», como recebidos.' : 'Fica em «Notas & contactos».',
        action: { label: 'Abrir dossier', onClick: () => navigate(`/dossiers/${caseId}/${docs ? 'documentos' : 'notas'}`) },
      });
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível anexar', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function discard(it: SharedItem) {
    if (it.id === undefined) return;
    await removeInbox(it.id);
    notifyInbox();
    await refresh();
  }

  const n = items?.length ?? 0;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Inbox size={14} aria-hidden /> Partilha
          </div>
          <h1>Recebidos</h1>
          <p className="lede">Ficheiros e ligações partilhados para o Balcão a partir do telemóvel ou de outra aplicação — escolha o dossier e anexe.</p>
        </div>
      </div>
      <Card>
        <CardHead
          icon={Inbox}
          title={n === 1 ? '1 item por tratar' : `${n} itens por tratar`}
          subtitle="Ficheiros passam a documentos «recebidos» do dossier; texto ou ligação fica como nota."
          actions={
            <select id="rx-case" className="select" aria-label="Dossier de destino" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Escolher o dossier…</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ref} · {c.name}
                </option>
              ))}
            </select>
          }
        />
        <div className="card-body stack" style={{ gap: 10 }}>
          {items === null ? (
            <p className="small subtle">A carregar…</p>
          ) : items.length === 0 ? (
            <Empty
              icon={Inbox}
              title="Nada recebido"
              text={
                <>
                  No Android, com a aplicação instalada, use <strong>Partilhar → Balcão das Sucessões</strong> num PDF, numa fotografia ou numa ligação: o item aparece aqui para anexar a um dossier. No iPhone a partilha direta ainda não é suportada — anexe os ficheiros no separador «Documentos» do dossier.
                </>
              }
            />
          ) : (
            items.map((it) => (
              <div key={it.id} className="callout" style={{ alignItems: 'flex-start' }}>
                {it.files.length ? <FileText aria-hidden /> : <Link2 aria-hidden />}
                <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                  <strong>{itemTitle(it)}</strong>
                  <div className="small subtle">Recebido em {formatDateTime(it.at)}</div>
                  {it.files.length > 0 && (
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {it.files.map((f, i) => (
                        <li key={i}>
                          {f.name} · {formatBytes(f.size)} · {f.type || 'tipo desconhecido'}
                        </li>
                      ))}
                    </ul>
                  )}
                  {it.text && (
                    <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {it.text}
                    </p>
                  )}
                  {it.url && (
                    <a className="small" href={it.url} target="_blank" rel="noreferrer noopener">
                      {it.url}
                    </a>
                  )}
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Button size="sm" variant="primary" icon={Paperclip} disabled={!caseId || busy} title={!caseId ? 'Escolha primeiro o dossier' : undefined} onClick={() => void attach(it)}>
                      {it.files.length ? 'Anexar ao dossier' : 'Guardar como nota'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void discard(it)}>
                      Ignorar
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
