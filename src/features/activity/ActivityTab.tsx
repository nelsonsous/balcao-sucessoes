import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  Landmark,
  ListChecks,
  MessageSquare,
  NotebookPen,
  Receipt,
  Recycle,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { db } from '../../lib/db';
import { useTrashCount } from '../../lib/recycle';
import type { ActivityRecord } from '../../lib/types';
import { formatDateTime, normalize, timeAgo } from '../../lib/utils';
import { Card, CardHead, Empty } from '../../components/ui';

type Kind = ActivityRecord['kind'];

const KIND_ICON: Record<Kind, LucideIcon> = {
  dossier: FolderOpen,
  tarefa: ListChecks,
  interessado: Users,
  patrimonio: Landmark,
  passivo: Wallet,
  nota: NotebookPen,
  contacto: MessageSquare,
  questionario: ClipboardList,
  agenda: CalendarDays,
  documento: FileText,
  honorarios: Receipt,
};

export const KIND_LABELS: Record<Kind, string> = {
  dossier: 'Dossier',
  tarefa: 'Tarefas',
  interessado: 'Interessados',
  patrimonio: 'Património',
  passivo: 'Passivo',
  nota: 'Notas',
  contacto: 'Contactos',
  questionario: 'Questionário',
  agenda: 'Agenda',
  documento: 'Documentos',
  honorarios: 'Honorários',
};

/** Entradas de anulação, reposição ou reciclagem. */
export const isReversal = (r: Pick<ActivityRecord, 'text'>): boolean => /^anulado\b|reposto|reciclagem/i.test(r.text);

export function ActivityTab({ caseId }: { caseId: string }) {
  const rows = useLiveQuery(() => db.activity.where('caseId').equals(caseId).reverse().sortBy('at'), [caseId]);
  const trash = useTrashCount(caseId);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | ''>('');
  const [onlyReversals, setOnlyReversals] = useState(false);

  const filtered = useMemo(() => {
    const n = normalize(q);
    return (rows ?? []).filter((r) => (!kind || r.kind === kind) && (!onlyReversals || isReversal(r)) && (!n || normalize(`${r.text} ${r.actor}`).includes(n)));
  }, [rows, q, kind, onlyReversals]);

  const kinds = useMemo(() => {
    const present = new Set((rows ?? []).map((r) => r.kind));
    return (Object.keys(KIND_LABELS) as Kind[]).filter((k) => present.has(k));
  }, [rows]);

  return (
    <Card>
      <CardHead
        icon={History}
        title="Histórico do dossier"
        subtitle="Registo automático de todas as alterações relevantes — quem, o quê e quando."
        actions={
          trash > 0 ? (
            <Link href={`/reciclagem?dossier=${caseId}`} className="btn sm">
              <Recycle aria-hidden /> Reciclagem ({trash})
            </Link>
          ) : undefined
        }
      />
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="toolbar" style={{ gap: 8 }}>
          <label className="search" style={{ flex: 1, minWidth: 180 }}>
            <Search size={15} aria-hidden />
            <input className="input" placeholder="Pesquisar no histórico…" aria-label="Pesquisar no histórico" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="select" aria-label="Tipo de registo" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}>
            <option value="">Todos os tipos</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <label className="checkbox small">
            <input type="checkbox" checked={onlyReversals} onChange={(e) => setOnlyReversals(e.target.checked)} />
            Só anulações e reposições
          </label>
          <span className="small subtle" aria-live="polite">
            {rows ? `${filtered.length} de ${rows.length}` : ''}
          </span>
        </div>
        {rows && rows.length === 0 ? (
          <Empty icon={History} title="Sem atividade" />
        ) : rows && filtered.length === 0 ? (
          <Empty icon={Search} title="Nenhum registo corresponde ao filtro" />
        ) : (
          <ol className="timeline">
            {filtered.slice(0, 300).map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={r.id} className={isReversal(r) ? 'reversal' : undefined}>
                  <span className="tl-icon" aria-hidden>
                    <Icon />
                  </span>
                  <div className="tl-body">
                    <div>{r.text}</div>
                    <div className="tiny subtle" title={formatDateTime(r.at)}>
                      {r.actor} · {KIND_LABELS[r.kind]} · {timeAgo(r.at)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
