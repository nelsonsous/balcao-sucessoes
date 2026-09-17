// Calculadora sucessória — Código Civil português.
// Sucessão legítima (arts. 2131.º e ss.) e legitimária (arts. 2156.º e ss.).
// Resultado indicativo, a validar pela equipa no caso concreto.
import { ONE, ZERO, add, div, frac, lt, mul, sub, sum, toNumber, type Frac } from './fraction';

export type HeirStatus = 'vivo' | 'predefunto' | 'repudiou' | 'indigno';
export type Regime = 'comunhao_adquiridos' | 'comunhao_geral' | 'separacao';

export interface CalcPerson {
  id: string;
  name: string;
  status: HeirStatus;
  /** Irmãos: germano (mesmo pai e mãe) ou unilateral (consanguíneo/uterino). */
  kind?: 'germano' | 'unilateral';
  /** Outros colaterais: grau de parentesco (3.º ou 4.º). */
  degree?: 3 | 4;
  /** Descendentes que o representam se não puder ou não quiser aceitar. */
  descendants: CalcPerson[];
}

export interface CalcValues {
  own: number | null;
  common: number | null;
  debts: number | null;
  donations: number | null;
  testamentary: number | null;
}

export interface CalcInput {
  deceasedName: string;
  spouse: { present: boolean; name: string; regime: Regime };
  children: CalcPerson[];
  parents: number;
  grandparents: number;
  siblings: CalcPerson[];
  collaterals: CalcPerson[];
  values: CalcValues;
}

export type SuccessionClass = 'descendentes' | 'ascendentes' | 'conjuge' | 'irmaos' | 'colaterais' | 'estado';

export interface HeirShare {
  key: string;
  personId?: string;
  name: string;
  relation: string;
  /** Quota na herança (sucessão legítima). */
  fraction: Frac;
  /** Cadeia de representação (ex.: ["Rui (pré-falecido)"]). */
  via: string[];
  legitimario: boolean;
  /** Quota na legítima global, expressa em fração da massa de cálculo. */
  legitima: Frac;
  /** Beneficiário não isento de Imposto do Selo (verba 1.2 TGIS). */
  taxed: boolean;
  amount: number | null;
  legitimaAmount: number | null;
  stampDuty: number | null;
}

export interface CalcStep {
  text: string;
  legal?: string;
}

export interface CalcResult {
  klass: SuccessionClass;
  klassLabel: string;
  shares: HeirShare[];
  legitimaFraction: Frac;
  availableFraction: Frac;
  values: {
    relictum: number;
    meacao: number;
    net: number;
    base: number;
    legitima: number;
    available: number;
    testamentary: number;
    excess: number;
    stampDuty: number;
  };
  hasValues: boolean;
  steps: CalcStep[];
  warnings: string[];
}

export const STATUS_LABELS: Record<HeirStatus, string> = {
  vivo: 'Vivo',
  predefunto: 'Pré-falecido',
  repudiou: 'Repudiou',
  indigno: 'Incapaz (indignidade)',
};

let seq = 0;
export const personId = (): string => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newPerson(partial: Partial<CalcPerson> = {}): CalcPerson {
  return { id: personId(), name: '', status: 'vivo', descendants: [], ...partial };
}

export function emptyCalcInput(): CalcInput {
  return {
    deceasedName: '',
    spouse: { present: false, name: '', regime: 'comunhao_adquiridos' },
    children: [],
    parents: 0,
    grandparents: 0,
    siblings: [],
    collaterals: [],
    values: { own: null, common: null, debts: null, donations: null, testamentary: null },
  };
}

/** Uma pessoa (ou a sua estirpe) é chamada se aceitar, ou se tiver descendentes chamados. */
export function isCalled(p: CalcPerson): boolean {
  return p.status === 'vivo' || p.descendants.some(isCalled);
}

const label = (p: CalcPerson, fallback: string) => p.name.trim() || fallback;

/** Divide `total` por estirpes (art. 2044.º CC), com pesos opcionais por cabeça. */
function byStirpes(
  heads: CalcPerson[],
  total: Frac,
  relation: (p: CalcPerson, depth: number) => string,
  opts: { weight?: (p: CalcPerson) => number; depth?: number; via?: string[]; fallback: string },
): Array<Omit<HeirShare, 'legitimario' | 'legitima' | 'taxed' | 'amount' | 'legitimaAmount' | 'stampDuty'>> {
  const called = heads.filter(isCalled);
  if (!called.length) return [];
  const depth = opts.depth ?? 0;
  const weights = called.map((p) => opts.weight?.(p) ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const out: Array<Omit<HeirShare, 'legitimario' | 'legitima' | 'taxed' | 'amount' | 'legitimaAmount' | 'stampDuty'>> = [];
  called.forEach((p, i) => {
    const part = mul(total, frac(weights[i]!, totalWeight));
    const name = label(p, `${opts.fallback} ${i + 1}`);
    if (p.status === 'vivo') {
      out.push({ key: p.id, personId: p.id, name, relation: relation(p, depth), fraction: part, via: opts.via ?? [] });
    } else {
      const reason = p.status === 'predefunto' ? 'pré-falecido' : p.status === 'repudiou' ? 'repudiou' : 'incapaz';
      out.push(
        ...byStirpes(p.descendants, part, relation, {
          depth: depth + 1,
          via: [...(opts.via ?? []), `${name} (${reason})`],
          fallback: 'Descendente',
        }),
      );
    }
  });
  return out;
}

const childRelation = (_p: CalcPerson, depth: number) => (depth === 0 ? 'Filho(a)' : depth === 1 ? 'Neto(a) — representação' : 'Bisneto(a) — representação');
const siblingRelation = (p: CalcPerson, depth: number) =>
  depth === 0 ? (p.kind === 'unilateral' ? 'Irmão(ã) unilateral' : 'Irmão(ã) germano(a)') : 'Sobrinho(a) — representação';

function valueOf(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function calculate(input: CalcInput): CalcResult {
  const steps: CalcStep[] = [];
  const warnings: string[] = [];
  const spouse = input.spouse.present;
  const spouseName = input.spouse.name.trim() || 'Cônjuge';
  const childHeads = input.children.filter(isCalled);
  const hasDesc = childHeads.length > 0;
  const hasAsc = input.parents > 0 || input.grandparents > 0;

  type Partial = Omit<HeirShare, 'legitimario' | 'legitima' | 'taxed' | 'amount' | 'legitimaAmount' | 'stampDuty'>;
  let partials: Partial[] = [];
  let klass: SuccessionClass;
  let legitimaFraction: Frac = ZERO;
  const legitimarios = new Set<string>();

  if (hasDesc) {
    klass = 'descendentes';
    const k = childHeads.length;
    let childrenTotal = ONE;
    if (spouse) {
      const perHead = frac(1, k + 1);
      const spouseShare = lt(perHead, frac(1, 4)) ? frac(1, 4) : perHead;
      childrenTotal = sub(ONE, spouseShare);
      partials.push({ key: 'conjuge', name: spouseName, relation: 'Cônjuge', fraction: spouseShare, via: [] });
      legitimarios.add('conjuge');
      steps.push({
        text:
          k >= 4
            ? `Cônjuge com ${k} estirpes de filhos: a partilha por cabeça daria menos de ¼, pelo que o cônjuge recebe ¼ e os filhos dividem ¾.`
            : `Cônjuge e ${k} estirpe(s) de filhos: partilha por cabeça em ${k + 1} partes iguais.`,
        legal: 'Código Civil, art. 2139.º, n.º 1',
      });
    } else {
      steps.push({ text: `Sem cônjuge: a herança divide-se pelos filhos em partes iguais (${k} estirpe(s)).`, legal: 'Código Civil, art. 2139.º, n.º 2' });
    }
    const kids = byStirpes(input.children, childrenTotal, childRelation, { fallback: 'Filho' });
    kids.forEach((x) => legitimarios.add(x.key));
    partials.push(...kids);
    if (kids.some((x) => x.via.length)) {
      steps.push({ text: 'Descendentes de filhos que não podem ou não querem aceitar sucedem por direito de representação, dividindo a quota da estirpe.', legal: 'Código Civil, arts. 2039.º, 2042.º e 2044.º' });
    }
    legitimaFraction = spouse ? frac(2, 3) : k === 1 ? frac(1, 2) : frac(2, 3);
    steps.push({
      text: spouse
        ? 'Legítima do cônjuge e dos filhos, em concurso: ⅔ da herança.'
        : k === 1
          ? 'Legítima de um só filho (ou estirpe): ½ da herança.'
          : 'Legítima de dois ou mais filhos (ou estirpes): ⅔ da herança.',
      legal: spouse ? 'Código Civil, art. 2159.º, n.º 1' : 'Código Civil, arts. 2159.º, n.º 2, e 2160.º',
    });
    if (hasAsc) warnings.push('Havendo descendentes, os ascendentes não são chamados à sucessão (art. 2134.º CC).');
  } else if (hasAsc) {
    klass = 'ascendentes';
    const ascTotal = spouse ? frac(1, 3) : ONE;
    if (spouse) {
      partials.push({ key: 'conjuge', name: spouseName, relation: 'Cônjuge', fraction: frac(2, 3), via: [] });
      legitimarios.add('conjuge');
      steps.push({ text: 'Sem descendentes, com cônjuge e ascendentes: ⅔ para o cônjuge e ⅓ para os ascendentes.', legal: 'Código Civil, art. 2142.º, n.º 1' });
    } else {
      steps.push({ text: 'Sem descendentes nem cônjuge: os ascendentes são chamados à totalidade da herança.', legal: 'Código Civil, art. 2142.º, n.º 2' });
    }
    const n = input.parents > 0 ? input.parents : input.grandparents;
    const rel = input.parents > 0 ? 'Pai / Mãe' : 'Avô / Avó';
    for (let i = 0; i < n; i++) {
      const key = `asc-${i}`;
      partials.push({ key, name: `${rel} ${n > 1 ? i + 1 : ''}`.trim(), relation: input.parents > 0 ? 'Ascendente (1.º grau)' : 'Ascendente (2.º grau)', fraction: mul(ascTotal, frac(1, n)), via: [] });
      legitimarios.add(key);
    }
    if (input.parents > 0 && input.grandparents > 0) {
      warnings.push('Os pais afastam os avós: o grau mais próximo prefere ao mais afastado (art. 2135.º CC).');
    }
    steps.push({ text: `Entre ascendentes, o grau mais próximo prefere e a partilha faz-se por cabeça (${n} ${n === 1 ? 'ascendente' : 'ascendentes'}).`, legal: 'Código Civil, arts. 2135.º e 2136.º' });
    legitimaFraction = spouse ? frac(2, 3) : input.parents > 0 ? frac(1, 2) : frac(1, 3);
    steps.push({
      text: spouse
        ? 'Legítima do cônjuge e dos ascendentes, em concurso: ⅔ da herança.'
        : input.parents > 0
          ? 'Legítima dos pais (sem cônjuge nem descendentes): ½ da herança.'
          : 'Legítima dos ascendentes do 2.º grau ou seguintes: ⅓ da herança.',
      legal: spouse ? 'Código Civil, art. 2161.º, n.º 1' : 'Código Civil, art. 2161.º, n.º 2',
    });
  } else if (spouse) {
    klass = 'conjuge';
    partials.push({ key: 'conjuge', name: spouseName, relation: 'Cônjuge', fraction: ONE, via: [] });
    legitimarios.add('conjuge');
    steps.push({ text: 'Sem descendentes nem ascendentes: o cônjuge é chamado à totalidade da herança.', legal: 'Código Civil, art. 2144.º' });
    legitimaFraction = frac(1, 2);
    steps.push({ text: 'Legítima do cônjuge que não concorre com descendentes nem ascendentes: ½ da herança.', legal: 'Código Civil, art. 2158.º' });
    if (input.siblings.some(isCalled)) warnings.push('Havendo cônjuge, os irmãos não são chamados (art. 2144.º CC).');
  } else if (input.siblings.some(isCalled)) {
    klass = 'irmaos';
    partials = byStirpes(input.siblings, ONE, siblingRelation, {
      fallback: 'Irmão',
      weight: (p) => (p.kind === 'unilateral' ? 1 : 2),
    });
    const mixed = input.siblings.filter(isCalled).some((p) => p.kind === 'unilateral') && input.siblings.filter(isCalled).some((p) => p.kind !== 'unilateral');
    steps.push({ text: 'Sem cônjuge, descendentes nem ascendentes: são chamados os irmãos e, por representação, os seus descendentes.', legal: 'Código Civil, art. 2145.º' });
    if (mixed) steps.push({ text: 'Concorrendo irmãos germanos e unilaterais, cada germano recebe o dobro de cada unilateral.', legal: 'Código Civil, art. 2146.º' });
    steps.push({ text: 'Não há herdeiros legitimários: a totalidade da herança é disponível por testamento.', legal: 'Código Civil, art. 2157.º' });
  } else if (input.collaterals.some((c) => c.status === 'vivo')) {
    klass = 'colaterais';
    const alive = input.collaterals.filter((c) => c.status === 'vivo');
    const nearest = Math.min(...alive.map((c) => c.degree ?? 4));
    const called = alive.filter((c) => (c.degree ?? 4) === nearest);
    called.forEach((c, i) =>
      partials.push({ key: c.id, personId: c.id, name: label(c, `Colateral ${i + 1}`), relation: `Colateral (${nearest}.º grau)`, fraction: frac(1, called.length), via: [] }),
    );
    steps.push({ text: `São chamados os colaterais até ao 4.º grau, preferindo os mais próximos (${nearest}.º grau), por cabeça.`, legal: 'Código Civil, arts. 2147.º e 2148.º' });
    if (called.length < alive.length) warnings.push('Colaterais de grau mais afastado ficam excluídos.');
    steps.push({ text: 'Não há herdeiros legitimários: a totalidade da herança é disponível por testamento.', legal: 'Código Civil, art. 2157.º' });
  } else {
    klass = 'estado';
    partials.push({ key: 'estado', name: 'Estado', relation: 'Estado', fraction: ONE, via: [] });
    steps.push({ text: 'Na falta de cônjuge e de todos os parentes sucessíveis, é chamado o Estado.', legal: 'Código Civil, art. 2152.º' });
  }

  // ---- Valores
  const v = input.values;
  const hasValues = [v.own, v.common, v.debts, v.donations, v.testamentary].some((x) => typeof x === 'number');
  const communal = spouse && input.spouse.regime !== 'separacao';
  const common = spouse ? valueOf(v.common) : 0;
  const meacao = communal ? common / 2 : 0;
  const relictum = valueOf(v.own) + (communal ? common / 2 : common);
  const net = relictum - valueOf(v.debts);
  const base = net + valueOf(v.donations);
  const legitimaValue = toNumber(legitimaFraction) * base;
  const available = base - legitimaValue;
  const testamentary = valueOf(v.testamentary);
  const excess = Math.max(0, testamentary - available);

  if (communal && common > 0) {
    steps.unshift({
      text: 'Antes da partilha, separa-se a meação do cônjuge: metade dos bens comuns não integra a herança.',
      legal: 'Código Civil, arts. 1688.º e 1689.º',
    });
  }
  if (hasValues) {
    steps.push({
      text: 'Cálculo da legítima: valor dos bens à data da morte, mais doações e despesas sujeitas a colação, menos as dívidas da herança.',
      legal: 'Código Civil, art. 2162.º',
    });
  }
  if (excess > 0) {
    warnings.push('As disposições testamentárias indicadas excedem a quota disponível: são inoficiosas na parte em excesso e redutíveis a requerimento dos herdeiros legitimários (arts. 2168.º e ss. CC).');
  }
  if (net < 0) warnings.push('O passivo excede o ativo: avaliar a aceitação a benefício de inventário (arts. 2052.º e 2071.º CC).');
  if (spouse && !communal && (v.common ?? 0) > 0) warnings.push('Em separação de bens não há bens comuns: registe os bens em compropriedade como bens próprios na quota do falecido.');

  const legitimaTotal = legitimaFraction;
  const legitimarioShares = partials.filter((p) => legitimarios.has(p.key));
  const legitimarioTotal = sum(legitimarioShares.map((p) => p.fraction));

  const shares: HeirShare[] = partials.map((p) => {
    const isLeg = legitimarios.has(p.key);
    const legitima = isLeg && legitimarioTotal.n > 0 ? mul(legitimaTotal, div(p.fraction, legitimarioTotal)) : ZERO;
    const taxed = klass === 'irmaos' || klass === 'colaterais';
    const amount = hasValues ? toNumber(p.fraction) * net : null;
    return {
      ...p,
      legitimario: isLeg,
      legitima,
      taxed,
      amount,
      legitimaAmount: hasValues && isLeg ? toNumber(legitima) * base : null,
      stampDuty: hasValues && taxed && amount !== null ? Math.max(0, amount) * 0.1 : null,
    };
  });

  if (klass === 'irmaos' || klass === 'colaterais') {
    steps.push({ text: 'Irmãos e outros colaterais não beneficiam da isenção de Imposto do Selo: taxa de 10% sobre o valor recebido (estimativa).', legal: 'Código do Imposto do Selo, art. 6.º, al. e); TGIS, verba 1.2' });
  }

  const total = sum(shares.map((s) => s.fraction));
  if (shares.length && Math.abs(toNumber(total) - 1) > 1e-9) warnings.push('As quotas não somam a unidade — reveja os dados introduzidos.');

  const KLASS_LABEL: Record<SuccessionClass, string> = {
    descendentes: spouse ? '1.ª classe — cônjuge e descendentes' : '1.ª classe — descendentes',
    ascendentes: spouse ? '2.ª classe — cônjuge e ascendentes' : '2.ª classe — ascendentes',
    conjuge: 'Cônjuge (na falta de descendentes e ascendentes)',
    irmaos: '3.ª classe — irmãos e seus descendentes',
    colaterais: '4.ª classe — outros colaterais até ao 4.º grau',
    estado: '5.ª classe — Estado',
  };

  return {
    klass,
    klassLabel: KLASS_LABEL[klass],
    shares,
    legitimaFraction,
    availableFraction: sub(ONE, legitimaFraction),
    values: {
      relictum,
      meacao,
      net,
      base,
      legitima: legitimaValue,
      available,
      testamentary,
      excess,
      stampDuty: shares.reduce((s, x) => s + (x.stampDuty ?? 0), 0),
    },
    hasValues,
    steps,
    warnings,
  };
}

/** Soma de verificação útil nos testes e na interface. */
export const totalShares = (r: CalcResult): Frac => r.shares.reduce((acc, s) => add(acc, s.fraction), ZERO);
