// Cópias de segurança automáticas para uma pasta do dispositivo (File System Access API),
// sempre cifradas com palavra-passe e com rotação das mais antigas. Se a pasta for uma pasta
// sincronizada (OneDrive, SharePoint, Google Drive, NAS), o escritório fica com um repositório
// central de cópias sem precisar de servidor próprio.
import { exportBackup } from './backup';
import { encryptText } from './crypto';
import { db, getSetting, setSetting, type AppSettings } from './db';
import { todayIso } from './utils';

export const AUTO_PREFIX = 'balcao-sucessoes-auto-';
export const README_NAME = 'LEIA-ME.txt';
/** Intervalo mínimo entre cópias no modo «a cada alteração». */
export const MIN_GAP_MS = 10 * 60_000;

export const README_TEXT = [
  'Cópias de segurança automáticas do Balcão das Sucessões.',
  '',
  'Cada ficheiro «balcao-sucessoes-auto-<data>-<hora>.cifrada.json» está cifrado (AES-256-GCM) com a palavra-passe',
  'definida na aplicação em Definições → Cópias automáticas. Sem ela, o ficheiro não pode ser lido.',
  '',
  'Para repor: abrir a aplicação → Definições → Dados e privacidade → Importar cópia → escolher o ficheiro → palavra-passe.',
  'As cópias mais antigas são apagadas automaticamente (rotação), mantendo-se apenas as últimas N.',
  '',
].join('\n');

// Tipos mínimos da File System Access API (não estão nas definições padrão do TypeScript).
export interface WritableLike {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}
export interface DirHandle {
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterable<string>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export const supportsDirectoryPicker = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Abre o seletor de pasta do sistema; devolve null se o utilizador cancelar ou não houver suporte. */
export async function pickDirectory(): Promise<DirHandle | null> {
  const w = window as unknown as { showDirectoryPicker?: (o: { mode: 'readwrite'; id: string; startIn: string }) => Promise<DirHandle> };
  if (!w.showDirectoryPicker) return null;
  try {
    return await w.showDirectoryPicker({ mode: 'readwrite', id: 'balcao-copias', startIn: 'documents' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

/** Verifica (e, com `request`, pede — precisa de um gesto do utilizador) a permissão de escrita na pasta. */
export async function hasPermission(dir: DirHandle, request = false): Promise<boolean> {
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!request || !dir.requestPermission) return false;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

const DIR_KEY = 'autoBackupDir';

/** Guarda a pasta escolhida (os handles são persistíveis em IndexedDB) e o nome para mostrar. */
export async function saveDirectory(dir: DirHandle | null): Promise<void> {
  await db.settings.put({ key: DIR_KEY, value: dir });
  await setSetting('autoBackupDirName', dir?.name ?? '');
}

export async function loadDirectory(): Promise<DirHandle | null> {
  const row = await db.settings.get(DIR_KEY);
  return (row?.value as DirHandle | undefined) ?? null;
}

export function autoBackupName(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${AUTO_PREFIX}${todayIso(d)}-${hh}${mm}.cifrada.json`;
}

export const isAutoBackupName = (n: string): boolean => n.startsWith(AUTO_PREFIX) && n.endsWith('.json');

/** Nomes das cópias automáticas existentes na pasta, da mais antiga para a mais recente. */
export async function listAutoBackups(dir: DirHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const n of dir.keys()) if (isAutoBackupName(n)) names.push(n);
  return names.sort();
}

async function writeText(dir: DirHandle, name: string, text: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function rotate(dir: DirHandle, keep: number, current: string): Promise<string[]> {
  const names = await listAutoBackups(dir);
  const removed: string[] = [];
  while (names.length > keep) {
    const n = names.shift()!;
    if (n === current) break;
    await dir.removeEntry(n);
    removed.push(n);
  }
  return removed;
}

export interface WriteOptions {
  passphrase: string;
  includeFiles: boolean;
  /** Número de cópias a manter na pasta (as mais antigas são apagadas). */
  keep: number;
  hint?: string;
  now?: Date;
}

export interface WriteResult {
  name: string;
  bytes: number;
  removed: string[];
  cases: number;
}

/** Escreve uma cópia cifrada na pasta (e o LEIA-ME, uma vez) e apaga as mais antigas além de `keep`. */
export async function writeAutoBackup(dir: DirHandle, opts: WriteOptions): Promise<WriteResult> {
  if (!opts.passphrase) throw new Error('As cópias automáticas exigem uma palavra-passe.');
  const data = await exportBackup({ includeFiles: opts.includeFiles });
  const json = JSON.stringify(await encryptText(JSON.stringify(data), opts.passphrase, opts.hint ? { hint: opts.hint } : {}));
  const name = autoBackupName(opts.now);
  await writeText(dir, name, json);
  try {
    await dir.getFileHandle(README_NAME);
  } catch {
    await writeText(dir, README_NAME, README_TEXT);
  }
  const removed = await rotate(dir, Math.max(1, Math.floor(opts.keep) || 1), name);
  return { name, bytes: json.length, removed, cases: data.tables.cases?.length ?? 0 };
}

export type AutoBackupEvery = AppSettings['autoBackupEvery'];

export const EVERY_LABELS: Record<AutoBackupEvery, string> = {
  alteracao: 'A cada alteração (mín. 10 min de intervalo)',
  diaria: 'Uma vez por dia, se houver alterações',
  semanal: 'Uma vez por semana, se houver alterações',
};

/** Decide se está na altura de fazer uma cópia, dada a última cópia e a última alteração aos dados. */
export function shouldRunAutoBackup(s: Pick<AppSettings, 'autoBackupEnabled' | 'autoBackupEvery' | 'lastAutoBackupAt'>, latestChange: string, now: Date = new Date()): boolean {
  if (!s.autoBackupEnabled || !latestChange) return false;
  const last = s.lastAutoBackupAt;
  if (!last) return true;
  if (latestChange <= last) return false;
  const gap = now.getTime() - new Date(last).getTime();
  if (s.autoBackupEvery === 'alteracao') return gap >= MIN_GAP_MS;
  if (s.autoBackupEvery === 'diaria') return todayIso(new Date(last)) !== todayIso(now);
  return gap >= 7 * 86_400_000;
}

/** Instante da alteração mais recente aos dados dos dossiers (ficha ou histórico). */
export async function latestChangeAt(): Promise<string> {
  const c = await db.cases.orderBy('updatedAt').last();
  const a = await db.activity.orderBy('at').last();
  return [c?.updatedAt ?? '', a?.at ?? ''].sort().pop() ?? '';
}

export type TickStatus = 'desligado' | 'sem-pasta' | 'sem-permissao' | 'nada-a-fazer' | 'feito' | 'erro';

/**
 * Um ciclo do agendador: se as cópias estiverem ativas, houver pasta com permissão e for altura,
 * escreve a cópia e regista o resultado nas definições. `force` ignora o agendamento (botão «Copiar agora»).
 */
export async function autoBackupTick(opts: { dir?: DirHandle | null; now?: Date; force?: boolean } = {}): Promise<{ status: TickStatus; result?: WriteResult; error?: string }> {
  const enabled = await getSetting('autoBackupEnabled');
  if (!enabled && !opts.force) return { status: 'desligado' };
  const dir = opts.dir === undefined ? await loadDirectory() : opts.dir;
  if (!dir) return { status: 'sem-pasta' };
  if (!(await hasPermission(dir))) {
    await setSetting('autoBackupLastError', 'permissao');
    return { status: 'sem-permissao' };
  }
  const s = { autoBackupEnabled: true, autoBackupEvery: await getSetting('autoBackupEvery'), lastAutoBackupAt: await getSetting('lastAutoBackupAt') };
  if (!opts.force && !shouldRunAutoBackup(s, await latestChangeAt(), opts.now)) return { status: 'nada-a-fazer' };
  try {
    const result = await writeAutoBackup(dir, {
      passphrase: await getSetting('autoBackupPass'),
      includeFiles: await getSetting('autoBackupFiles'),
      keep: await getSetting('autoBackupKeep'),
      now: opts.now,
    });
    const at = (opts.now ?? new Date()).toISOString();
    await setSetting('lastAutoBackupAt', at);
    await setSetting('lastBackupAt', at);
    await setSetting('autoBackupLastError', '');
    return { status: 'feito', result };
  } catch (e) {
    const error = (e as Error).message || String(e);
    await setSetting('autoBackupLastError', error);
    return { status: 'erro', error };
  }
}
