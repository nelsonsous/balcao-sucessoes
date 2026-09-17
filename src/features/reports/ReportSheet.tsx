import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FileDown, FileText, Printer, Save } from 'lucide-react';
import { blocksToText } from '../../engine/templates';
import { db, logActivity, newDocument } from '../../lib/db';
import { attachFile, docKey } from '../../lib/documents';
import { DOCX_MIME, buildDocx } from '../../lib/docx';
import { REPORT_KINDS, buildReport, loadCaseBundle, type BuiltReport, type ReportKind } from '../../lib/reports';
import type { CaseRecord } from '../../lib/types';
import { downloadFile, formatDate, todayIso, uid } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Segmented, Sheet } from '../../components/ui';
import { DocPreview } from '../templates/TemplateComposer';

/** Relatórios do dossier: pré-visualização em papel, Word, PDF e arquivo no dossier. */
export function ReportSheet({ c, kind, onClose, onKind }: { c: CaseRecord; kind: ReportKind | null; onClose: () => void; onKind: (k: ReportKind) => void }) {
  const toast = useToast();
  const [report, setReport] = useState<BuiltReport | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    void loadCaseBundle(c).then((b) => {
      if (!cancelled) setReport(buildReport(kind, b));
    });
    return () => {
      cancelled = true;
    };
  }, [kind, c]);

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

  const meta = REPORT_KINDS.find((k) => k.id === kind);
  const ready = report && report.kind === kind ? report : null;
  const docxBytes = () => (ready ? buildDocx(ready.blocks, { title: ready.title }) : new Uint8Array());

  async function copy() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(blocksToText(ready.blocks));
      toast({ tone: 'success', title: 'Texto copiado' });
    } catch {
      toast({ tone: 'error', title: 'Não foi possível copiar', description: 'Selecione o texto na pré-visualização e copie manualmente.' });
    }
  }

  async function saveToCase() {
    if (!ready || !meta) return;
    const name = `${meta.label} — ${formatDate(todayIso())}`;
    const doc = newDocument(c.id, { name, category: 'minutas', source: 'minuta', status: 'recebido', key: `${docKey(name)}|${uid()}` });
    await db.documents.add(doc);
    await attachFile(doc, new Blob([docxBytes() as BlobPart], { type: DOCX_MIME }), `${ready.fileBase}.docx`);
    await logActivity(c.id, 'documento', `Relatório gerado: ${meta.label}`);
    toast({ tone: 'success', title: 'Relatório guardado no dossier', description: 'Disponível no separador Documentos.' });
  }

  return (
    <Sheet
      open={Boolean(kind)}
      onClose={onClose}
      title={meta?.label ?? 'Relatório'}
      subtitle={meta?.description}
      icon={FileText}
      footer={
        <>
          <Button icon={Copy} disabled={!ready} onClick={() => void copy()}>
            Copiar
          </Button>
          <Button icon={FileDown} disabled={!ready} onClick={() => ready && downloadFile(`${ready.fileBase}.docx`, docxBytes() as BlobPart, DOCX_MIME)}>
            Word
          </Button>
          <Button icon={Printer} disabled={!ready} onClick={() => setPrinting(true)}>
            PDF
          </Button>
          <span className="spacer" />
          <Button variant="primary" icon={Save} disabled={!ready} onClick={() => void saveToCase()}>
            Guardar no dossier
          </Button>
        </>
      }
    >
      <div className="report-sheet">
        <div className="report-kinds">
          <Segmented<ReportKind> label="Tipo de relatório" value={kind ?? 'interno'} onChange={onKind} options={REPORT_KINDS.map((k) => ({ value: k.id, label: k.label }))} />
        </div>
        <p className="tiny subtle">Gerado com os dados atuais do dossier. Reveja antes de enviar — conteúdo de apoio, a validar pela equipa.</p>
        <div className="composer-preview">{ready ? <DocPreview blocks={ready.blocks} /> : <div className="skeleton" style={{ height: 360 }} />}</div>
      </div>
      {printing &&
        ready &&
        createPortal(
          <div className="print-doc">
            <DocPreview blocks={ready.blocks} />
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
