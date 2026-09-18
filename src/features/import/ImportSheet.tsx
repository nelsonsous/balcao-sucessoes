import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert, ClipboardPaste, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { importSheetRows } from '../../lib/actions';
import { downloadCsv } from '../../lib/csv';
import { db } from '../../lib/db';
import { KINSHIP_LABELS, ROLE_LABELS } from '../../lib/labels';
import {
  ENTITY_LABELS,
  IMPORT_FIELDS,
  autoMap,
  buildRows,
  decodeText,
  importable,
  parseTable,
  summarize,
  templateHeader,
  type ImportEntity,
  type ImportRow,
} from '../../lib/sheetImport';
import type { CaseRecord, Kinship, PartyRole } from '../../lib/types';
import { cx, formatEur } from '../../lib/utils';
import { ASSET_META } from '../../components/icons';
import { useToast } from '../../components/Toast';
import { Button, Segmented, Sheet } from '../../components/ui';

const MAX_PREVIEW = 200;

const PLACEHOLDER: Record<ImportEntity, string> = {
  parties: 'Nome\tNIF\tParentesco\tQualidade\tE-mail\nMaria Exemplo\t…\tFilha\tHerdeira\tmaria@exemplo.pt',
  assets: 'Descrição\tTipo\tValor\tArtigo matricial\tFreguesia\nApartamento T2\tImóvel\t185 000,00\tU-1234\tArroios',
  debts: 'Credor\tDescrição\tValor\tGarantia\nBanco Exemplo\tCrédito à habitação\t42 300,00\tHipoteca',
};

/** Valores legíveis de uma linha, pela ordem das colunas mapeadas. */
function display(entity: ImportEntity, field: string, row: ImportRow): string {
  const v = (row.values as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === '') return '';
  if (field === 'kinship') return v ? KINSHIP_LABELS[v as Exclude<Kinship, ''>] : '';
  if (field === 'roles') return (v as PartyRole[]).map((r) => ROLE_LABELS[r]).join(', ');
  if (field === 'type' && entity === 'assets') return ASSET_META[v as keyof typeof ASSET_META]?.label ?? String(v);
  if (typeof v === 'number') return formatEur(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

/** Importar interessados, bens ou dívidas a partir de uma folha de cálculo (colar ou ficheiro CSV). */
export function ImportSheet({ c, entity: initial, allowed, onClose }: { c: CaseRecord; entity: ImportEntity | null; allowed: ImportEntity[]; onClose: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>(initial ?? allowed[0]!);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<string[]>([]);
  const [withDuplicates, setWithDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const existing = useLiveQuery(
    async () => {
      const [parties, assets, debts] = await Promise.all([
        db.parties.where('caseId').equals(c.id).toArray(),
        db.assets.where('caseId').equals(c.id).toArray(),
        db.debts.where('caseId').equals(c.id).toArray(),
      ]);
      return { parties, assets, debts };
    },
    [c.id],
  );

  useEffect(() => {
    if (!initial) return;
    setEntity(initial);
    setText('');
    setFileName('');
    setWithDuplicates(false);
    setBusy(false);
  }, [initial]);

  const table = useMemo(() => (text.trim() ? parseTable(text, entity) : null), [text, entity]);
  useEffect(() => setMapping(table ? autoMap(table.header, entity) : []), [table, entity]);

  const fields = IMPORT_FIELDS[entity];
  const rows = useMemo(() => (table && existing && mapping.length === table.header.length ? buildRows(table, mapping, entity, existing) : []), [table, mapping, entity, existing]);
  const sum = summarize(rows, withDuplicates);
  const missing = fields.filter((f) => f.required && !mapping.includes(f.key));
  const shownFields = mapping.filter(Boolean).slice(0, 5);
  const label = ENTITY_LABELS[entity];

  const setColumn = (col: number, key: string) => setMapping(mapping.map((m, i) => (i === col ? key : key && m === key ? '' : m)));

  const onFile = async (f: File) => {
    setFileName(f.name);
    setText(decodeText(new Uint8Array(await f.arrayBuffer())));
  };

  const run = async () => {
    const list = importable(rows, withDuplicates);
    if (!list.length) return;
    setBusy(true);
    try {
      const n = await importSheetRows(c.id, entity, list);
      toast({ tone: 'success', title: `${n} ${n === 1 ? label.one : label.many} importado(s)`, description: sum.withWarnings ? `${sum.withWarnings} com valores a confirmar (ficaram nas notas).` : undefined });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={Boolean(initial)}
      onClose={onClose}
      wide
      icon={FileSpreadsheet}
      title="Importar de uma folha de cálculo"
      subtitle="Copie as linhas no Excel, Numbers ou Google Sheets (com o cabeçalho) e cole aqui — ou abra um ficheiro CSV."
      footer={
        <>
          <span className="small subtle import-foot-count">{rows.length ? `${sum.ready} de ${sum.total} ${sum.total === 1 ? 'linha' : 'linhas'} a importar` : ''}</span>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy || !sum.ready || missing.length > 0} onClick={() => void run()}>
            Importar {sum.ready || ''} {sum.ready === 1 ? label.one : label.many}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {allowed.length > 1 && (
          <Segmented
            label="O que importar"
            value={entity}
            onChange={(e) => setEntity(e)}
            options={allowed.map((a) => ({ value: a, label: ENTITY_LABELS[a].many[0]!.toUpperCase() + ENTITY_LABELS[a].many.slice(1) }))}
          />
        )}
        <div className="field">
          <label htmlFor="imp-text">
            <ClipboardPaste size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden /> Dados copiados da folha de cálculo
          </label>
          <textarea
            id="imp-text"
            className="textarea import-paste"
            rows={6}
            spellCheck={false}
            data-autofocus
            value={text}
            placeholder={PLACEHOLDER[entity]}
            onChange={(e) => {
              setText(e.target.value);
              setFileName('');
            }}
          />
          <span className="hint">Ficheiros do Excel (.xlsx): selecione as células, copie e cole aqui, ou guarde como «CSV UTF-8».</span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>
            Abrir ficheiro CSV…
          </Button>
          <Button icon={Download} variant="ghost" onClick={() => downloadCsv(`modelo-${label.many.replace('í', 'i')}.csv`, templateHeader(entity), [])}>
            Descarregar modelo
          </Button>
          {fileName && <span className="small subtle">{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {table && table.rows.length === 0 && <p className="small subtle">Só foi encontrado o cabeçalho — cole também as linhas com os dados.</p>}

        {table && table.rows.length > 0 && (
          <>
            <section aria-labelledby="imp-cols">
              <h3 id="imp-cols" className="section-title">
                Colunas {table.hasHeader ? '(reconhecidas pelo cabeçalho)' : '(sem cabeçalho: indique o que é cada coluna)'}
              </h3>
              <div className="import-cols">
                {table.header.map((h, i) => (
                  <label key={i} className={cx('import-col', !mapping[i] && 'off')}>
                    <span className="import-col-head" title={h}>
                      {h}
                    </span>
                    <span className="tiny subtle import-col-sample">{table.rows.find((r) => r[i])?.[i] ?? '—'}</span>
                    <select className="select" aria-label={`Coluna «${h}»`} value={mapping[i] ?? ''} onChange={(e) => setColumn(i, e.target.value)}>
                      <option value="">Ignorar</option>
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {missing.length > 0 && (
                <div className="callout danger" role="alert" style={{ marginTop: 10 }}>
                  <CircleAlert aria-hidden />
                  <div>Indique a coluna com {missing.map((f) => `«${f.label}»`).join(' e ')}.</div>
                </div>
              )}
            </section>

            {missing.length === 0 && (
              <section aria-labelledby="imp-rows" className="stack" style={{ gap: 10 }}>
                <div className="row wrap" style={{ gap: 12 }}>
                  <h3 id="imp-rows" className="section-title" style={{ margin: 0 }}>
                    Pré-visualização
                  </h3>
                  <span className="small" data-testid="import-summary">
                    {sum.total} {sum.total === 1 ? 'linha' : 'linhas'} · <strong>{sum.ready} a importar</strong>
                    {sum.withWarnings ? ` · ${sum.withWarnings} com avisos` : ''}
                    {sum.errors ? ` · ${sum.errors} com erros` : ''}
                    {sum.duplicates ? ` · ${sum.duplicates} repetida(s)` : ''}
                  </span>
                  {sum.duplicates > 0 && (
                    <label className="checkbox small">
                      <input type="checkbox" checked={withDuplicates} onChange={(e) => setWithDuplicates(e.target.checked)} />
                      Importar também as repetidas
                    </label>
                  )}
                </div>
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Pré-visualização da importação">
                  <table className="table import-table">
                    <thead>
                      <tr>
                        <th scope="col">Linha</th>
                        <th scope="col">Estado</th>
                        {shownFields.map((k) => (
                          <th key={k} scope="col">
                            {fields.find((f) => f.key === k)?.label ?? k}
                          </th>
                        ))}
                        <th scope="col">Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, MAX_PREVIEW).map((r) => {
                        const status = r.errors.length ? 'erro' : r.duplicate && !withDuplicates ? 'repetida' : r.warnings.length ? 'aviso' : 'ok';
                        return (
                          <tr key={r.line} className={`imp-${status}`}>
                            <td className="tabular">{r.line}</td>
                            <td>
                              <span className={cx('badge', status === 'ok' && 'ok', status === 'aviso' && 'warn', status === 'erro' && 'critical', status === 'repetida' && 'outline')}>
                                {status === 'ok' ? 'Pronta' : status === 'aviso' ? 'Com avisos' : status === 'erro' ? 'Erro' : 'Repetida'}
                              </span>
                            </td>
                            {shownFields.map((k) => (
                              <td key={k}>{display(entity, k, r)}</td>
                            ))}
                            <td className="small">{[...r.errors, ...(r.duplicate ? [`Repetida: ${r.duplicate}`] : []), ...r.warnings].join(' · ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length > MAX_PREVIEW && (
                  <p className="tiny subtle">
                    A mostrar as primeiras {MAX_PREVIEW} linhas de {rows.length}; todas serão importadas.
                  </p>
                )}
                <p className="tiny subtle">Linhas com erro não são importadas. Os valores por confirmar (NIF, e-mail, valores ou tipos não reconhecidos) ficam registados nas notas de cada registo.</p>
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
