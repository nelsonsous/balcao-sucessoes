// Higiene do código-fonte: nenhum ficheiro pode ter caracteres invisíveis ou de controlo
// literais (NUL, BOM, U+FFFD, espaços de largura zero, espaços não separáveis…) — usam-se sempre escapes ("\uFEFF").
// Já aconteceu (um NUL numa expressão regular do gerador de Word e BOMs no CSV): as
// ferramentas passam a tratar o ficheiro como binário e as diferenças deixam de se ver.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'e2e', 'public', 'index.html', 'vite.config.ts', 'README.md', 'ITERACOES.md'];
const TEXT = /\.(ts|tsx|js|mjs|css|html|json|md|webmanifest|svg|txt)$/;
const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00a0\u00ad\u200b-\u200f\u2009\u2028\u2029\u202f\u2060\ufeff\ufffd]/g;

function files(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return TEXT.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => (name === 'node_modules' || name.startsWith('.') ? [] : files(join(path, name))));
}

describe('higiene do código-fonte', () => {
  it('sem caracteres invisíveis ou de controlo literais', () => {
    const problems: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(BAD)) {
        const line = text.slice(0, m.index).split('\n').length;
        problems.push(`${f}:${line} U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
