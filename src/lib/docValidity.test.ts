import { describe, expect, it } from 'vitest';
import { EXPIRY_WARNING_DAYS, defaultValidMonths, expiringDocs, validMonthsOf, validity, validityBadge } from './docValidity';
import { newDocument } from './db';

const TODAY = new Date(2026, 8, 17, 12);

describe('validade dos documentos', () => {
  it('validade por omissão pelo nome (certidões 6 meses, registo criminal 3, resto não expira)', () => {
    expect(defaultValidMonths('Certidão de óbito')).toBe(6);
    expect(defaultValidMonths('Certidão de nascimento — Maria')).toBe(6);
    expect(defaultValidMonths('Certidão permanente do registo predial')).toBe(6);
    expect(defaultValidMonths('Certificado de registo criminal')).toBe(3);
    expect(defaultValidMonths('Procuração forense')).toBe(0);
    expect(defaultValidMonths('Documento de identificação e NIF — João')).toBe(0);
    expect(validMonthsOf({ name: 'Certidão de óbito' })).toBe(6);
    expect(validMonthsOf({ name: 'Certidão de óbito', validMonths: 0 })).toBe(0);
    expect(newDocument('c', { name: 'Certidão de casamento' }).validMonths).toBe(6);
    expect(newDocument('c', { name: 'Escritura' }).validMonths).toBe(0);
  });

  it('só os documentos recebidos expiram; a emissão assume a receção; avisa nos últimos 30 dias', () => {
    const base = newDocument('c', { name: 'Certidão de óbito', status: 'recebido' });
    expect(validity({ ...base, receivedAt: '' }, TODAY).state).toBe('sem_data');
    expect(validity({ ...base, status: 'em_falta', receivedAt: '2026-01-01' }, TODAY).state).toBe('sem_data');
    expect(validity(newDocument('c', { name: 'Procuração', status: 'recebido', receivedAt: '2020-01-01' }), TODAY).state).toBe('sem_validade');
    const ok = validity({ ...base, receivedAt: '2026-09-01' }, TODAY);
    expect(ok).toMatchObject({ state: 'ok', expiresAt: '2027-03-01', months: 6 });
    expect(ok.daysLeft).toBe(165);
    const soon = validity({ ...base, receivedAt: '2026-03-25' }, TODAY); // expira a 25/09 → 8 dias
    expect(soon.state).toBe('a_expirar');
    expect(soon.daysLeft).toBe(8);
    expect(validityBadge(soon)).toBe('Expira em 8 dia(s)');
    const today = validity({ ...base, receivedAt: '2026-03-17' }, TODAY);
    expect(validityBadge(today)).toBe('Expira hoje');
    const gone = validity({ ...base, receivedAt: '2026-02-01' }, TODAY); // expirou a 1/8 → 47 dias
    expect(gone.state).toBe('expirada');
    expect(validityBadge(gone)).toBe('Expirada há 47 dia(s)');
    expect(validityBadge(ok)).toBeNull();
    // a data de emissão prevalece sobre a receção; a validade pode ser alterada
    expect(validity({ ...base, receivedAt: '2026-09-01', issuedAt: '2026-01-10' }, TODAY).state).toBe('expirada');
    expect(validity({ ...base, receivedAt: '2026-09-01', issuedAt: '2026-01-10', validMonths: 12 }, TODAY).state).toBe('ok');
    expect(EXPIRY_WARNING_DAYS).toBe(30);
  });

  it('lista os documentos a expirar ou expirados', () => {
    const docs = [
      newDocument('c', { id: 'a', name: 'Certidão de óbito', status: 'recebido', receivedAt: '2026-02-01' }),
      newDocument('c', { id: 'b', name: 'Certidão de nascimento', status: 'validado', receivedAt: '2026-09-10' }),
      newDocument('c', { id: 'd', name: 'Certidão de casamento', status: 'recebido', receivedAt: '2026-03-25' }),
      newDocument('c', { id: 'e', name: 'Procuração', status: 'recebido', receivedAt: '2020-01-01' }),
    ];
    expect(expiringDocs(docs, TODAY).map((d) => d.id)).toEqual(['a', 'd']);
  });
});
