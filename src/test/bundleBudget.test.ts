import { describe, expect, it } from 'vitest';
import { BUDGET, evaluate, initialFiles, type Asset } from '../../scripts/bundle-budget';

const html = `<!doctype html><html><head>
<link rel="icon" href="./favicon.svg" />
<script type="module" crossorigin src="./assets/index-a1.js"></script>
<link rel="modulepreload" crossorigin href="./assets/db-b2.js">
<link rel="modulepreload" crossorigin href="./assets/phases-c3.js">
<link rel="stylesheet" crossorigin href="./assets/index-d4.css">
<link rel="manifest" href="./manifest.webmanifest">
</head><body><script src="./theme-init.js"></script></body></html>`;

const asset = (file: string, gzipKb: number): Asset => ({ file, bytes: gzipKb * 3 * 1024, gzip: gzipKb * 1024 });

describe('orçamento de tamanho do pacote', () => {
  it('o arranque é o script de entrada, os pré-carregados e as folhas de estilo (não os scripts clássicos)', () => {
    expect(initialFiles(html)).toEqual({ js: ['assets/index-a1.js', 'assets/db-b2.js', 'assets/phases-c3.js'], css: ['assets/index-d4.css'] });
  });

  it('dentro do orçamento: tudo ✓; o maior pedaço a pedido ignora os do arranque', () => {
    const assets = [asset('assets/index-a1.js', 90), asset('assets/db-b2.js', 39), asset('assets/phases-c3.js', 3), asset('assets/index-d4.css', 19), asset('assets/SettingsPage-e5.js', 14), asset('assets/Agenda-f6.js', 6)];
    const r = evaluate(assets, initialFiles(html));
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => [x.label, x.kb])).toEqual([
      ['JavaScript do arranque', 132],
      ['CSS do arranque', 19],
      ['Maior pedaço a pedido', 14],
      ['JavaScript total (offline)', 152],
    ]);
    expect(r.rows[2]!.detail).toBe('assets/SettingsPage-e5.js');
  });

  it('um pedaço pesado importado no arranque faz falhar o orçamento', () => {
    const assets = [asset('assets/index-a1.js', 90 + 40), asset('assets/db-b2.js', 39), asset('assets/phases-c3.js', 3), asset('assets/index-d4.css', 19)];
    const r = evaluate(assets, initialFiles(html));
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => !x.ok)).toMatchObject({ label: 'JavaScript do arranque', limit: BUDGET.initialJsKb });
  });
});
