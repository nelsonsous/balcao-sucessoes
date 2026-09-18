// Orçamento de tamanho do pacote (corre no CI depois do build: `npm run size`).
// O JavaScript do arranque, o maior pedaço carregado a pedido e o total guardado para
// uso offline não podem crescer sem se dar por isso. Tamanhos com compressão gzip,
// como chegam ao navegador. Corre com o Node sem compilar (tipos apagados pelo Node 24).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export interface Budget {
  /** JavaScript necessário para o primeiro ecrã (entrada + pré-carregados). */
  initialJsKb: number;
  /** CSS do arranque. */
  initialCssKb: number;
  /** Maior pedaço carregado a pedido. */
  largestLazyKb: number;
  /** Todo o JavaScript (é o que o service worker guarda para uso offline). */
  totalJsKb: number;
}

/**
 * Limites (~10% acima dos valores medidos na iteração 28: arranque 134 kB, CSS 19,6 kB,
 * maior pedaço 14,2 kB, total 378 kB). Antes da divisão em pedaços o arranque tinha ~251 kB.
 */
export const BUDGET: Budget = { initialJsKb: 148, initialCssKb: 22, largestLazyKb: 16, totalJsKb: 420 };

export interface Asset {
  /** Caminho relativo a dist/ (ex.: assets/index-abc.js). */
  file: string;
  bytes: number;
  gzip: number;
}

/** Ficheiros que o index.html pede logo: o script de entrada, os pré-carregados e as folhas de estilo. */
export function initialFiles(indexHtml: string): { js: string[]; css: string[] } {
  const norm = (p: string) => p.replace(/^\.\//, '').replace(/^\//, '');
  const js = [...indexHtml.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g), ...indexHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => norm(m[1]!));
  const css = [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => norm(m[1]!)).filter((f) => f.endsWith('.css'));
  return { js: [...new Set(js)], css: [...new Set(css)] };
}

export interface BudgetRow {
  label: string;
  kb: number;
  limit: number;
  ok: boolean;
  detail: string;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

export function evaluate(assets: Asset[], initial: { js: string[]; css: string[] }, budget: Budget = BUDGET): { rows: BudgetRow[]; ok: boolean } {
  const byFile = new Map(assets.map((a) => [a.file, a]));
  const sum = (files: string[]) => files.reduce((s, f) => s + (byFile.get(f)?.gzip ?? 0), 0);
  const js = assets.filter((a) => a.file.endsWith('.js'));
  const lazy = js.filter((a) => !initial.js.includes(a.file)).sort((a, b) => b.gzip - a.gzip);
  const largest = lazy[0];
  const rows: BudgetRow[] = [
    { label: 'JavaScript do arranque', kb: kb(sum(initial.js)), limit: budget.initialJsKb, ok: false, detail: `${initial.js.length} ficheiro(s)` },
    { label: 'CSS do arranque', kb: kb(sum(initial.css)), limit: budget.initialCssKb, ok: false, detail: `${initial.css.length} ficheiro(s)` },
    { label: 'Maior pedaço a pedido', kb: kb(largest?.gzip ?? 0), limit: budget.largestLazyKb, ok: false, detail: largest?.file ?? '—' },
    { label: 'JavaScript total (offline)', kb: kb(js.reduce((s, a) => s + a.gzip, 0)), limit: budget.totalJsKb, ok: false, detail: `${js.length} ficheiro(s)` },
  ];
  for (const r of rows) r.ok = r.kb <= r.limit;
  return { rows, ok: rows.every((r) => r.ok) };
}

export function readAssets(dist: string): Asset[] {
  return readdirSync(join(dist, 'assets'))
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .map((f) => {
      const buf = readFileSync(join(dist, 'assets', f));
      return { file: `assets/${f}`, bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
    });
}

function main(): void {
  const dist = process.argv[2] ?? 'dist';
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const { rows, ok } = evaluate(readAssets(dist), initialFiles(html));
  console.log('Orçamento de tamanho (gzip):');
  for (const r of rows) console.log(`  ${r.ok ? '✓' : '✗'} ${r.label.padEnd(28)} ${String(r.kb).padStart(7)} kB  (limite ${r.limit} kB)  ${r.detail}`);
  if (!ok) {
    console.error('Orçamento ultrapassado: carregue o novo código a pedido (import() / lazy) ou, se o aumento for justificado, atualize os limites em scripts/bundle-budget.ts.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
