// Diagnóstico da aplicação neste dispositivo: versão, service worker, caches, armazenamento,
// contagem de registos e funcionalidades do navegador. Só contagens e dados técnicos —
// nunca nomes nem conteúdos — para poder ser copiado e enviado a quem dá apoio.
import { db } from './db';
import type { IntegrityReport } from './integrity';

export interface FeatureCheck {
  id: string;
  label: string;
  ok: boolean;
  /** Para que serve na aplicação. */
  why: string;
}

export type SwState = 'ativo' | 'a instalar' | 'à espera' | 'sem registo' | 'não suportado';

export interface Diagnostics {
  collectedAt: string;
  version: string;
  dbVersion: number;
  online: boolean;
  standalone: boolean;
  sw: { state: SwState; controlled: boolean; updateWaiting: boolean; scope: string };
  caches: Array<{ name: string; entries: number }>;
  storage: { usage: number | null; quota: number | null; persisted: boolean | null };
  counts: Array<{ table: string; label: string; count: number }>;
  attachments: { count: number; bytes: number };
  env: { language: string; timeZone: string; screen: string; touch: boolean; reducedMotion: boolean; darkScheme: boolean; userAgent: string };
  features: FeatureCheck[];
}

export const COUNT_LABELS: Array<[string, string]> = [
  ['cases', 'Dossiers'],
  ['tasks', 'Tarefas'],
  ['parties', 'Interessados'],
  ['assets', 'Bens'],
  ['debts', 'Dívidas'],
  ['documents', 'Documentos'],
  ['events', 'Eventos'],
  ['notes', 'Notas'],
  ['contacts', 'Contactos'],
  ['activity', 'Histórico'],
  ['timeEntries', 'Registos de tempo'],
  ['expenses', 'Despesas'],
  ['provisions', 'Provisões'],
  ['members', 'Equipa'],
  ['templates', 'Minutas'],
  ['caseTemplates', 'Modelos de dossier'],
  ['officeRules', 'Regras do escritório'],
  ['trash', 'Reciclagem'],
  ['files', 'Anexos'],
];

const safe = async <T>(fn: () => Promise<T> | T, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export function featureChecks(win: Window & typeof globalThis = window): FeatureCheck[] {
  const nav = win.navigator as Navigator & { setAppBadge?: unknown };
  const has = (fn: () => unknown) => {
    try {
      return Boolean(fn());
    } catch {
      return false;
    }
  };
  return [
    { id: 'sw', label: 'Service worker', ok: has(() => 'serviceWorker' in nav), why: 'funcionar sem internet e receber atualizações' },
    { id: 'idb', label: 'IndexedDB', ok: has(() => win.indexedDB), why: 'guardar os dossiers neste dispositivo' },
    { id: 'persist', label: 'Armazenamento persistente', ok: has(() => nav.storage?.persist), why: 'pedir ao navegador que não apague os dados' },
    { id: 'crypto', label: 'Criptografia (Web Crypto)', ok: has(() => win.crypto?.subtle), why: 'cópias cifradas, partilha entre colegas e PIN' },
    { id: 'popover', label: 'Camada superior (Popover API)', ok: has(() => 'showPopover' in win.HTMLElement.prototype), why: 'menus que nunca ficam cortados' },
    { id: 'fs', label: 'Pastas locais (File System Access)', ok: has(() => 'showDirectoryPicker' in win), why: 'cópias automáticas para uma pasta sincronizada' },
    { id: 'share', label: 'Partilhar (Web Share)', ok: has(() => nav.share), why: 'enviar ficheiros a partir da aplicação' },
    { id: 'notif', label: 'Notificações', ok: has(() => 'Notification' in win), why: 'avisos de prazos' },
    { id: 'badge', label: 'Contador no ícone', ok: has(() => nav.setAppBadge), why: 'número de tarefas em atraso no ícone da aplicação instalada' },
    { id: 'clipboard', label: 'Área de transferência', ok: has(() => nav.clipboard?.writeText), why: 'copiar textos e este diagnóstico' },
  ];
}

async function serviceWorkerInfo(nav: Navigator): Promise<Diagnostics['sw']> {
  if (!('serviceWorker' in nav)) return { state: 'não suportado', controlled: false, updateWaiting: false, scope: '' };
  const reg = await safe(() => nav.serviceWorker.getRegistration(), undefined);
  const controlled = Boolean(nav.serviceWorker.controller);
  if (!reg) return { state: 'sem registo', controlled, updateWaiting: false, scope: '' };
  const state: SwState = reg.active ? 'ativo' : reg.installing ? 'a instalar' : reg.waiting ? 'à espera' : 'sem registo';
  return { state, controlled, updateWaiting: Boolean(reg.waiting && reg.active), scope: reg.scope };
}

async function cacheInfo(win: Window & typeof globalThis): Promise<Diagnostics['caches']> {
  if (!('caches' in win)) return [];
  const names = await safe(() => win.caches.keys(), [] as string[]);
  const out: Diagnostics['caches'] = [];
  for (const name of names) out.push({ name, entries: await safe(async () => (await (await win.caches.open(name)).keys()).length, 0) });
  return out;
}

/** Recolhe o diagnóstico (tolerante: o que o navegador não suporta fica em branco). */
export async function collectDiagnostics(win: Window & typeof globalThis = window): Promise<Diagnostics> {
  const nav = win.navigator;
  const est = await safe(() => nav.storage?.estimate?.(), undefined);
  const persisted = await safe(async () => (nav.storage?.persisted ? await nav.storage.persisted() : null), null);
  const counts: Diagnostics['counts'] = [];
  for (const [table, label] of COUNT_LABELS) counts.push({ table, label, count: await safe(() => db.table(table).count(), 0) });
  const docs = await safe(() => db.documents.filter((d) => Boolean(d.fileId)).toArray(), []);
  const mq = (q: string) => safe(() => win.matchMedia(q).matches, false);
  return {
    collectedAt: new Date().toISOString(),
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
    dbVersion: db.verno,
    online: nav.onLine,
    standalone: (await mq('(display-mode: standalone)')) || Boolean((nav as Navigator & { standalone?: boolean }).standalone),
    sw: await serviceWorkerInfo(nav),
    caches: await cacheInfo(win),
    storage: { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted },
    counts,
    attachments: { count: docs.length, bytes: docs.reduce((s, d) => s + (d.fileSize || 0), 0) },
    env: {
      language: nav.language,
      timeZone: await safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, ''),
      screen: `${win.screen?.width ?? 0}×${win.screen?.height ?? 0} (janela ${win.innerWidth}×${win.innerHeight})`,
      touch: (nav.maxTouchPoints ?? 0) > 0,
      reducedMotion: await mq('(prefers-reduced-motion: reduce)'),
      darkScheme: await mq('(prefers-color-scheme: dark)'),
      userAgent: nav.userAgent,
    },
    features: featureChecks(win),
  };
}

/** Tamanho legível: MB com uma casa decimal, ou GB a partir de 1 GB. */
export function mb(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`;
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}

const yes = (b: boolean | null) => (b === null ? 'desconhecido' : b ? 'sim' : 'não');

/** Texto do diagnóstico para copiar ou descarregar (sem dados pessoais). */
export function diagnosticsText(d: Diagnostics, report?: IntegrityReport | null): string {
  const lines = [
    'Balcão das Sucessões — diagnóstico',
    `Recolhido em: ${d.collectedAt}`,
    `Versão: ${d.version} · base de dados v${d.dbVersion}`,
    `Ligação: ${d.online ? 'online' : 'offline'} · aplicação instalada: ${yes(d.standalone)}`,
    `Service worker: ${d.sw.state}${d.sw.controlled ? ' (controla a página)' : ''}${d.sw.updateWaiting ? ' · atualização à espera' : ''}${d.sw.scope ? ` · âmbito ${d.sw.scope}` : ''}`,
    `Caches: ${d.caches.length ? d.caches.map((c) => `${c.name} (${c.entries})`).join(', ') : 'nenhuma'}`,
    `Armazenamento: ${mb(d.storage.usage)} de ${mb(d.storage.quota)} · persistente: ${yes(d.storage.persisted)}`,
    `Registos: ${d.counts.map((c) => `${c.label} ${c.count}`).join(' · ')}`,
    `Anexos: ${d.attachments.count} (${mb(d.attachments.bytes)})`,
    `Ambiente: ${d.env.language} · ${d.env.timeZone} · ${d.env.screen} · toque: ${yes(d.env.touch)} · movimento reduzido: ${yes(d.env.reducedMotion)} · tema escuro do sistema: ${yes(d.env.darkScheme)}`,
    `Funcionalidades: ${d.features.map((f) => `${f.ok ? '✓' : '✗'} ${f.label}`).join(', ')}`,
  ];
  if (report) {
    lines.push(
      report.issues.length
        ? `Integridade (${report.checkedAt}): ${report.issues.length} problema(s) — ${report.issues.map((i) => `[${i.severity}] ${i.title} (${i.count})`).join('; ')}`
        : `Integridade (${report.checkedAt}): sem problemas em ${report.totals.records} registos`,
    );
  }
  lines.push(`Navegador: ${d.env.userAgent}`);
  return `${lines.join('\n')}\n`;
}
