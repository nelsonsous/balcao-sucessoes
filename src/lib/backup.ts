// Cópia de segurança: exportação/importação integral em JSON (anexos em base64).
import { db } from './db';
import type { FileRecord } from './types';
import { downloadFile, nowIso, todayIso } from './utils';

export const BACKUP_APP = 'balcao-das-sucessoes';
export const BACKUP_VERSION = 2;

const TABLES = [
  'cases',
  'tasks',
  'parties',
  'assets',
  'debts',
  'notes',
  'contacts',
  'members',
  'activity',
  'settings',
  'events',
  'documents',
  'caseTemplates',
  'templates',
  'files',
] as const;
type TableName = (typeof TABLES)[number];

interface SerializedFile extends Omit<FileRecord, 'blob'> {
  dataUrl: string;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  includesFiles: boolean;
  tables: Partial<Record<TableName, unknown[]>>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, data = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(opts: { includeFiles?: boolean } = {}): Promise<BackupFile> {
  const includeFiles = opts.includeFiles ?? true;
  const tables: BackupFile['tables'] = {};
  for (const t of TABLES) {
    if (t === 'files') {
      if (!includeFiles) continue;
      const rows = await db.files.toArray();
      const out: SerializedFile[] = [];
      for (const f of rows) {
        const { blob, ...rest } = f;
        out.push({ ...rest, dataUrl: await blobToDataUrl(blob) });
      }
      tables.files = out;
    } else {
      tables[t] = await db.table(t).toArray();
    }
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: nowIso(), includesFiles: includeFiles, tables };
}

export async function downloadBackup(opts: { includeFiles?: boolean } = {}): Promise<number> {
  const data = await exportBackup(opts);
  const json = JSON.stringify(data);
  downloadFile(`balcao-sucessoes-copia-${todayIso()}.json`, json, 'application/json');
  return data.tables.cases?.length ?? 0;
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O ficheiro não é um JSON válido.');
  }
  const d = data as Partial<BackupFile>;
  if (!d || d.app !== BACKUP_APP || typeof d.tables !== 'object' || d.tables === null) {
    throw new Error('Este ficheiro não é uma cópia de segurança do Balcão das Sucessões.');
  }
  if ((d.version ?? 0) > BACKUP_VERSION) {
    throw new Error('A cópia foi criada por uma versão mais recente da aplicação. Atualize a aplicação primeiro.');
  }
  for (const t of TABLES) {
    const rows = (d.tables as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabela "${t}" inválida na cópia.`);
  }
  return { includesFiles: false, ...d } as BackupFile;
}

/**
 * replace: apaga tudo e repõe a cópia (os anexos só são apagados se a cópia os incluir).
 * merge: acrescenta/atualiza registos (os ids iguais são substituídos).
 */
export async function importBackup(file: BackupFile, mode: 'replace' | 'merge'): Promise<{ cases: number }> {
  const files = (file.tables.files ?? []) as SerializedFile[];
  const restoredFiles: FileRecord[] = files.map(({ dataUrl, ...rest }) => ({ ...rest, blob: dataUrlToBlob(dataUrl) }));
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') {
      for (const t of TABLES) {
        if (t === 'files' && !file.includesFiles) continue;
        await db.table(t).clear();
      }
    }
    for (const t of TABLES) {
      if (t === 'files') {
        if (restoredFiles.length) await db.files.bulkPut(restoredFiles);
        continue;
      }
      const rows = file.tables[t] ?? [];
      if (rows.length) await db.table(t).bulkPut(rows as never[]);
    }
  });
  return { cases: file.tables.cases?.length ?? 0 };
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

export async function attachmentsSize(): Promise<{ count: number; bytes: number }> {
  const docs = await db.documents.filter((d) => Boolean(d.fileId)).toArray();
  return { count: docs.length, bytes: docs.reduce((s, d) => s + (d.fileSize || 0), 0) };
}
