import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { Recycle, RotateCcw, Trash2 } from 'lucide-react';
import { db } from '../../lib/db';
import { TRASH_LABELS, TRASH_RETENTION_DAYS, daysLeft, deleteTrash, emptyTrash, restoreTrash, useTrash, type CaseBundle } from '../../lib/recycle';
import type { TrashRecord, TrashTable } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Empty, useConfirm } from '../../components/ui';

const TYPES = Object.keys(TRASH_LABELS) as TrashTable[];

/** Reciclagem: itens apagados nos últimos 30 dias, com reposição ou remoção definitiva. */
export function RecyclePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [caseFilter, setCaseFilter] = useState(() => new URLSearchParams(search).get('dossier') ?? '');
  const [typeFilter, setTypeFilter] = useState<TrashTable | ''>('');
  const rows = useTrash();
  const cases = useLiveQuery(() => db.cases.toArray(), []);
  const caseMap = useMemo(() => new Map((cases ?? []).map((c) => [c.id, c])), [cases]);

  const dossierName = (r: TrashRecord): string => {
    if (r.table === 'cases') return r.label;
    const c = caseMap.get(r.caseId);
    if (c) return `${c.ref} · ${c.name}`;
    const bundle = (rows ?? []).find((x) => x.table === 'cases' && x.caseId === r.caseId);
    if (bundle) return `${bundle.label} (dossier na reciclagem)`;
    return r.caseId ? '(dossier apagado)' : 'Agenda do escritório';
  };

  const dossierOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) if (!seen.has(r.caseId)) seen.set(r.caseId, dossierName(r));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, caseMap]);

  const list = (rows ?? []).filter((r) => (!caseFilter || r.caseId === caseFilter) && (!typeFilter || r.table === typeFilter));

  async function restore(r: TrashRecord) {
    try {
      await restoreTrash(r.id);
      const target = r.table === 'cases' ? `/dossiers/${r.caseId}` : r.caseId ? `/dossiers/${r.caseId}` : '/agenda';
      toast({ tone: 'success', title: 'Reposto da reciclagem', description: `${TRASH_LABELS[r.table]}: ${r.label}`, action: { label: 'Abrir', onClick: () => navigate(target) } });
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível repor', description: (e as Error).message });
    }
  }

  async function remove(r: TrashRecord) {
    const ok = await confirm({ title: `Apagar definitivamente ${TRASH_LABELS[r.table].toLowerCase()} ${r.label}?`, message: 'Esta ação não pode ser anulada.', confirmLabel: 'Apagar definitivamente', danger: true });
    if (!ok) return;
    await deleteTrash(r.id);
    toast({ title: 'Apagado definitivamente' });
  }

  async function empty() {
    const n = list.length;
    const ok = await confirm({ title: caseFilter ? 'Esvaziar a reciclagem deste dossier?' : 'Esvaziar toda a reciclagem?', message: `${n} item(ns) serão apagados definitivamente. Esta ação não pode ser anulada.`, confirmLabel: 'Esvaziar', danger: true });
    if (!ok) return;
    const removed = await emptyTrash(caseFilter || undefined);
    toast({ title: `${removed} item(ns) apagado(s) definitivamente` });
  }

  const summary = (r: TrashRecord): string => {
    if (r.table === 'cases') {
      const b = r.data as CaseBundle;
      const n = Object.values(b.tables).reduce((s, rows) => s + rows.length, 0);
      return `${n} registos · ${r.files.length} anexo(s)`;
    }
    return r.files.length ? `${r.files.length} anexo(s)` : '';
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Recycle size={14} aria-hidden /> Escritório
          </div>
          <h1>Reciclagem</h1>
          <p className="lede">O que se apaga fica aqui {TRASH_RETENTION_DAYS} dias e pode ser reposto no sítio de origem — tarefas, interessados, bens, dívidas, notas, contactos, eventos, documentos com anexo e dossiers inteiros.</p>
        </div>
        <div className="page-actions">
          <Button variant="danger-soft" icon={Trash2} disabled={!list.length} onClick={() => void empty()}>
            {caseFilter ? 'Esvaziar (dossier)' : 'Esvaziar reciclagem'}
          </Button>
        </div>
      </div>
      <Card>
        <CardHead
          icon={Recycle}
          title={list.length === 1 ? '1 item' : `${list.length} itens`}
          subtitle="A reposição fica registada no histórico do dossier."
          actions={
            <div className="row wrap" style={{ gap: 8 }}>
              <select className="select" aria-label="Dossier" value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)}>
                <option value="">Todos os dossiers</option>
                {dossierOptions.map(([id, name]) => (
                  <option key={id || '-'} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select className="select" aria-label="Tipo" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TrashTable | '')}>
                <option value="">Todos os tipos</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRASH_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <div className="card-body">
          {rows && list.length === 0 ? (
            <Empty icon={Recycle} title="Reciclagem vazia" text="Quando remover algo num dossier, aparece aqui durante 30 dias." />
          ) : (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Itens na reciclagem">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Tipo</th>
                    <th scope="col">Item</th>
                    <th scope="col">Dossier</th>
                    <th scope="col">Apagado</th>
                    <th scope="col">Expira</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="badge">{TRASH_LABELS[r.table]}</span>
                      </td>
                      <td>
                        <strong>{r.label}</strong>
                        {summary(r) && <div className="tiny subtle">{summary(r)}</div>}
                      </td>
                      <td className="small">{dossierName(r)}</td>
                      <td className="small">
                        {formatDateTime(r.deletedAt)}
                        <div className="tiny subtle">por {r.deletedBy}</div>
                      </td>
                      <td className="small">{daysLeft(r)} dia(s)</td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="sm" variant="primary" icon={RotateCcw} onClick={() => void restore(r)}>
                            Repor
                          </Button>
                          <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Apagar definitivamente ${r.label}`} onClick={() => void remove(r)}>
                            Apagar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
