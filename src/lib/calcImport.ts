// Ponte entre o dossier e a calculadora sucessória.
import { emptyCalcInput, newPerson, type CalcInput, type Regime } from '../engine/succession';
import { db } from './db';
import type { CaseRecord } from './types';

export function readCalc(c: CaseRecord): CalcInput | null {
  if (!c.calcJson) return null;
  try {
    const parsed = JSON.parse(c.calcJson) as CalcInput;
    const base = emptyCalcInput();
    return { ...base, ...parsed, spouse: { ...base.spouse, ...parsed.spouse }, values: { ...base.values, ...parsed.values } };
  } catch {
    return null;
  }
}

export const writeCalc = (input: CalcInput): string => JSON.stringify(input);

/**
 * Pré-preenche a calculadora com os dados do dossier.
 * Devolve também notas sobre o que precisa de revisão manual.
 */
export async function calcInputFromCase(c: CaseRecord): Promise<{ input: CalcInput; notes: string[] }> {
  const [parties, assets, debts] = await Promise.all([
    db.parties.where('caseId').equals(c.id).toArray(),
    db.assets.where('caseId').equals(c.id).toArray(),
    db.debts.where('caseId').equals(c.id).toArray(),
  ]);
  const notes: string[] = [];
  const input = emptyCalcInput();
  input.deceasedName = c.deceased.name;

  const a = c.answers;
  const spouse = parties.find((p) => p.kinship === 'conjuge');
  if (a.spouse === 'casado' || spouse) {
    const regime: Regime =
      a.regime === 'comunhao_geral' ? 'comunhao_geral' : a.regime === 'separacao' ? 'separacao' : 'comunhao_adquiridos';
    input.spouse = { present: true, name: spouse?.name ?? '', regime };
    if (a.regime === '' || a.regime === 'desconhecido') notes.push('Regime de bens desconhecido: assumida a comunhão de adquiridos (regime supletivo).');
  }
  if (a.spouse === 'uniao_facto') notes.push('O unido de facto não é herdeiro legal — não entra no cálculo (Lei n.º 7/2001).');

  const alive = (p: (typeof parties)[number]) => p.acceptance !== 'repudiou';
  input.children = parties
    .filter((p) => p.kinship === 'filho')
    .map((p) => newPerson({ name: p.name, status: alive(p) ? 'vivo' : 'repudiou' }));
  const grandchildren = parties.filter((p) => p.kinship === 'neto');
  if (grandchildren.length) {
    input.children.push(
      newPerson({
        name: 'Filho(a) a identificar',
        status: 'predefunto',
        descendants: grandchildren.map((p) => newPerson({ name: p.name, status: alive(p) ? 'vivo' : 'repudiou' })),
      }),
    );
    notes.push('Netos importados sob um filho pré-falecido genérico — confirme a que estirpe pertence cada neto.');
  }
  const expected = Number(a.descendantsCount) || 0;
  if (expected > input.children.length) notes.push(`O questionário indica ${expected} filhos, mas só ${input.children.length} estão registados nos Interessados.`);

  input.parents = Math.min(2, parties.filter((p) => p.kinship === 'progenitor').length);
  input.grandparents = Math.min(4, parties.filter((p) => p.kinship === 'avo').length);
  input.siblings = parties
    .filter((p) => p.kinship === 'irmao')
    .map((p) => newPerson({ name: p.name, status: alive(p) ? 'vivo' : 'repudiou', kind: 'germano' }));
  const nephews = parties.filter((p) => p.kinship === 'sobrinho');
  if (nephews.length && (input.siblings.length || !input.children.length)) {
    input.siblings.push(
      newPerson({
        name: 'Irmão(ã) a identificar',
        status: 'predefunto',
        kind: 'germano',
        descendants: nephews.map((p) => newPerson({ name: p.name })),
      }),
    );
    notes.push('Sobrinhos importados sob um irmão pré-falecido genérico — confirme a estirpe e se é germano ou unilateral.');
  }
  if (input.siblings.length) notes.push('Irmãos importados como germanos — ajuste os unilaterais (recebem metade).');
  input.collaterals = parties
    .filter((p) => p.kinship === 'outro_parente')
    .map((p) => newPerson({ name: p.name, degree: 4 }));

  let own = 0;
  let common = 0;
  let valued = 0;
  for (const x of assets) {
    if (x.value === null) continue;
    valued += 1;
    if (x.ownership === 'comum' && input.spouse.present) common += x.value;
    else own += x.value;
  }
  if (valued) {
    input.values.own = own;
    input.values.common = input.spouse.present ? common : null;
  }
  const debtTotal = debts.filter((d) => d.status !== 'pago').reduce((s, d) => s + (d.amount ?? 0), 0);
  if (debts.length) input.values.debts = debtTotal;
  if (assets.some((x) => x.ownership === 'desconhecido')) notes.push('Há bens por classificar (próprio/comum): foram contados como bens próprios.');
  if (a.gifts === 'sim') notes.push('Houve doações em vida: indique o seu valor para o cálculo da legítima.');
  if (a.will === 'sim') notes.push('Há testamento: indique o valor das disposições a favor de terceiros para verificar a inoficiosidade.');

  return { input, notes };
}
