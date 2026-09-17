import { describe, expect, it } from 'vitest';
import { emptyIntl } from '../engine/international';
import { emptyAnswers, newAsset, newCase } from './db';
import { hasForeignLinks, intlSuggestions, readIntl, writeIntl } from './intl';

describe('módulo internacional no dossier', () => {
  it('lê o estado guardado com valores por omissão e tolera JSON inválido', () => {
    const c = newCase({ name: 'X', ref: 'R' });
    expect(readIntl(c)).toEqual(emptyIntl());
    c.intlJson = writeIntl({ ...emptyIntl(), residence: 'França', entities: [{ id: 'e1', kind: 'notaire', name: 'Me Dupont', country: 'França', contact: '', notes: '' }] });
    const st = readIntl(c);
    expect(st.residence).toBe('França');
    expect(st.entities).toHaveLength(1);
    expect(st.cse.status).toBe('');
    c.intlJson = '{{';
    expect(readIntl(c)).toEqual(emptyIntl());
  });

  it('sugere residência, nacionalidade e países a partir do questionário e dos bens', () => {
    const c = newCase({ name: 'X', ref: 'R', answers: { ...emptyAnswers(), deathPlace: 'estrangeiro', deathCountry: 'Suíça', nationality: 'portuguesa', habitualResidence: 'franca', foreignCountries: ['França'] } });
    const assets = [newAsset(c.id, { country: 'Espanha' }), newAsset(c.id, { country: 'portugal' }), newAsset(c.id, { country: '' })];
    const s = intlSuggestions(c, assets);
    expect(s.residence).toBe('França');
    expect(s.nationalities).toEqual(['Portugal']);
    expect(s.deathCountry).toBe('Suíça');
    expect(s.countries).toEqual(['França', 'Espanha', 'Suíça']);
  });

  it('deteta elementos de estraneidade', () => {
    const pt = newCase({ name: 'PT', ref: 'R', answers: { ...emptyAnswers(), deathPlace: 'portugal', nationality: 'portuguesa', habitualResidence: 'portugal' } });
    expect(hasForeignLinks(pt, [], emptyIntl())).toBe(false);
    expect(hasForeignLinks(pt, [newAsset(pt.id, { country: 'Brasil' })], emptyIntl())).toBe(true);
    expect(hasForeignLinks(pt, [], { ...emptyIntl(), residence: 'Alemanha' })).toBe(true);
    const fr = newCase({ name: 'FR', ref: 'R', answers: { ...emptyAnswers(), nationality: 'francesa' } });
    expect(hasForeignLinks(fr, [], emptyIntl())).toBe(true);
  });
});
