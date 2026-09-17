import { describe, expect, it } from 'vitest';
import { applicableLaw, countryDeadlines, documentRegime, isBound650, isEU } from './international';

describe('lei aplicável (Reg. 650/2012)', () => {
  it('regra geral: residência habitual, com competência do mesmo Estado-Membro', () => {
    const r = applicableLaw({ residence: 'França', nationalities: ['Portugal'], choiceOfLaw: '', closerConnection: '', assetCountries: ['Portugal', 'França'] });
    expect(r.law).toBe('França');
    expect(r.basis).toBe('residencia');
    expect(r.jurisdiction).toBe('França');
    expect(r.cse.available).toBe(true);
    expect(r.steps.some((s) => s.legal?.includes('21.º'))).toBe(true);
  });
  it('escolha válida da lei da nacionalidade prevalece; escolha inválida gera aviso', () => {
    const ok = applicableLaw({ residence: 'França', nationalities: ['Portugal'], choiceOfLaw: 'Portugal', closerConnection: '', assetCountries: ['Portugal', 'França'] });
    expect(ok.law).toBe('Portugal');
    expect(ok.basis).toBe('escolha');
    expect(ok.steps.some((s) => s.legal?.includes('5.º a 7.º'))).toBe(true);
    const bad = applicableLaw({ residence: 'França', nationalities: ['Portugal'], choiceOfLaw: 'Espanha', closerConnection: '', assetCountries: [] });
    expect(bad.law).toBe('França');
    expect(bad.warnings.some((w) => w.includes('Espanha'))).toBe(true);
  });
  it('residência fora da UE: competência subsidiária e reenvio possível', () => {
    const r = applicableLaw({ residence: 'Brasil', nationalities: ['Portugal', 'Brasil'], choiceOfLaw: '', closerConnection: '', assetCountries: ['Portugal', 'Brasil'] });
    expect(r.law).toBe('Brasil');
    expect(r.jurisdiction).toBe('Portugal');
    expect(r.jurisdictionBasis).toContain('art. 10.º');
    expect(r.steps.some((s) => s.legal?.includes('34.º'))).toBe(true);
    expect(r.cse.available).toBe(true);
  });
  it('sem elementos transfronteiriços o CSE não é necessário; Reino Unido e Dinamarca avisam', () => {
    const pt = applicableLaw({ residence: 'Portugal', nationalities: ['Portugal'], choiceOfLaw: '', closerConnection: '', assetCountries: ['Portugal'] });
    expect(pt.cse.available).toBe(false);
    expect(applicableLaw({ residence: 'Reino Unido', nationalities: [], choiceOfLaw: '', closerConnection: '', assetCountries: [] }).warnings.join(' ')).toMatch(/Reino Unido/);
    expect(applicableLaw({ residence: 'Dinamarca', nationalities: [], choiceOfLaw: '', closerConnection: '', assetCountries: [] }).warnings.join(' ')).toMatch(/Dinamarca/);
    expect(isEU('Dinamarca')).toBe(true);
    expect(isBound650('Dinamarca')).toBe(false);
    expect(isBound650('Espanha')).toBe(true);
  });
});

describe('circulação de documentos', () => {
  it('UE sem apostila, Haia com apostila, outros com legalização', () => {
    expect(documentRegime('Espanha').regime).toBe('ue');
    expect(documentRegime('Brasil').regime).toBe('apostila');
    expect(documentRegime('Suíça').regime).toBe('apostila');
    expect(documentRegime('Angola').regime).toBe('legalizacao');
    expect(documentRegime('Outro').regime).toBe('desconhecido');
    expect(documentRegime('').regime).toBe('desconhecido');
  });
});

describe('prazos por país', () => {
  const today = new Date(2026, 8, 17, 12);
  it('França: 6 meses se o óbito foi em França, 12 meses caso contrário', () => {
    const inFrance = countryDeadlines(['França'], '2026-07-04', 'França', today);
    expect(inFrance.map((d) => d.dueDate)).toEqual(['2027-01-04']);
    const elsewhere = countryDeadlines(['França'], '2026-07-04', 'Portugal', today);
    expect(elsewhere.map((d) => d.dueDate)).toEqual(['2027-07-04']);
    expect(elsewhere[0]!.daysLeft).toBeGreaterThan(280);
  });
  it('ordena por data, trata dias e fins de mês, ignora países desconhecidos', () => {
    const list = countryDeadlines(['África do Sul', 'Alemanha', 'Narnia', 'Portugal'], '2026-08-31', 'Portugal', today);
    expect(list.map((d) => `${d.country}:${d.dueDate}`)).toEqual(['África do Sul:2026-09-14', 'Alemanha:2026-11-30', 'Portugal:2026-11-30']);
    expect(list[0]!.daysLeft).toBe(-3);
  });
  it('sem data de óbito não há prazos', () => {
    expect(countryDeadlines(['França'], '', 'França', today)).toEqual([]);
  });
});
