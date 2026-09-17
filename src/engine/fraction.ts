// Frações exatas (as quotas hereditárias não devem sofrer arredondamentos).

export interface Frac {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

export function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error('Denominador nulo');
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const ZERO = frac(0);
export const ONE = frac(1);

export const add = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac): Frac => frac(a.n * b.d, a.d * b.n);
export const eq = (a: Frac, b: Frac): boolean => a.n === b.n && a.d === b.d;
export const lt = (a: Frac, b: Frac): boolean => a.n * b.d < b.n * a.d;
export const sum = (list: Frac[]): Frac => list.reduce(add, ZERO);
export const toNumber = (f: Frac): number => f.n / f.d;

/** "2/9", "1" ou "0". */
export function fmtFrac(f: Frac): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 2 });
export const fmtPct = (f: Frac): string => pct.format(toNumber(f));

/** Frações comuns com caracteres dedicados (½, ⅓, ¼…), para leitura rápida. */
const VULGAR: Record<string, string> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '1/6': '⅙',
  '5/6': '⅚',
  '1/8': '⅛',
};

export function prettyFrac(f: Frac): string {
  return VULGAR[fmtFrac(f)] ?? fmtFrac(f);
}
