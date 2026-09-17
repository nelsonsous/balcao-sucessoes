// Estado do módulo internacional guardado no dossier (JSON em CaseRecord.intlJson).
import { emptyIntl, type IntlState } from '../engine/international';
import type { AssetRecord, CaseRecord } from './types';

export function readIntl(c: CaseRecord): IntlState {
  const base = emptyIntl();
  try {
    const raw = c.intlJson ? (JSON.parse(c.intlJson) as Partial<IntlState>) : {};
    return { ...base, ...raw, cse: { ...base.cse, ...(raw.cse ?? {}) }, entities: raw.entities ?? [], nationalities: raw.nationalities ?? [] };
  } catch {
    return base;
  }
}

export const writeIntl = (s: IntlState): string => JSON.stringify(s);

/** Sugestões a partir do questionário: residência, nacionalidade e países com bens. */
export function intlSuggestions(c: CaseRecord, assets: AssetRecord[]): { residence: string; nationalities: string[]; countries: string[]; deathCountry: string } {
  const a = c.answers;
  const residence = a.habitualResidence === 'portugal' ? 'Portugal' : a.habitualResidence === 'franca' ? 'França' : '';
  const nationalities = a.nationality === 'portuguesa' ? ['Portugal'] : a.nationality === 'francesa' ? ['França'] : [];
  const deathCountry = a.deathPlace === 'portugal' ? 'Portugal' : a.deathPlace === 'estrangeiro' ? a.deathCountry : '';
  const fromAssets = assets.map((x) => x.country.trim()).filter((x) => x && x.toLowerCase() !== 'portugal');
  const countries = [...new Set([...a.foreignCountries, ...fromAssets, deathCountry].filter((x) => x && x !== 'Outro'))];
  return { residence, nationalities, countries, deathCountry };
}

/** Há elementos de estraneidade no dossier? */
export function hasForeignLinks(c: CaseRecord, assets: AssetRecord[], intl: IntlState): boolean {
  const a = c.answers;
  return (
    a.deathPlace === 'estrangeiro' ||
    (a.nationality !== '' && a.nationality !== 'portuguesa') ||
    (a.habitualResidence !== '' && a.habitualResidence !== 'portugal') ||
    a.assets.includes('estrangeiro') ||
    a.foreignCountries.length > 0 ||
    assets.some((x) => x.country.trim() && x.country.trim().toLowerCase() !== 'portugal') ||
    intl.entities.length > 0 ||
    (intl.residence !== '' && intl.residence !== 'Portugal')
  );
}
