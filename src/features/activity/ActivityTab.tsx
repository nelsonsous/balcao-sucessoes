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
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { db } from '../../lib/db';
import type { ActivityRecord } from '../../lib/types';
import { formatDateTime, timeAgo } from '../../lib/utils';
import { Card, CardHead, Empty } from '../../components/ui';

const KIND_ICON: Record<ActivityRecord['kind'], LucideIcon> = {
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
};

export function ActivityTab({ caseId }: { caseId: string }) {
  const rows = useLiveQuery(
    () => db.activity.where('caseId').equals(caseId).reverse().sortBy('at'),
    [caseId],
  );
  return (
    <Card>
      <CardHead icon={History} title="Histórico do dossier" subtitle="Registo automático de todas as alterações relevantes — quem, o quê e quando." />
      <div className="card-body">
        {rows && rows.length === 0 ? (
          <Empty icon={History} title="Sem atividade" />
        ) : (
          <ol className="timeline">
            {(rows ?? []).slice(0, 300).map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={r.id}>
                  <span className="tl-icon" aria-hidden>
                    <Icon />
                  </span>
                  <div className="tl-body">
                    <div>{r.text}</div>
                    <div className="tiny subtle" title={formatDateTime(r.at)}>
                      {r.actor} · {timeAgo(r.at)}
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
