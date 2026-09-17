import { describe, expect, it } from 'vitest';
import { decryptText, encryptText, hashPin, isEncryptedEnvelope, lockoutSeconds, passphraseStrength, verifyPin, WrongPassphraseError } from './crypto';
import { maskName } from './utils';

describe('cópias cifradas (AES-GCM + PBKDF2)', () => {
  it('cifra e decifra com a palavra-passe certa', async () => {
    const env = await encryptText('{"cases":[{"name":"Sucessão Ção"}]}', 'Palavra-Passe 2026!', { hint: 'a do escritório', iterations: 2000 });
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(env.hint).toBe('a do escritório');
    expect(env.data).not.toContain('Sucessão');
    expect(JSON.stringify(env)).not.toContain('Palavra-Passe');
    expect(await decryptText(env, 'Palavra-Passe 2026!')).toBe('{"cases":[{"name":"Sucessão Ção"}]}');
  });
  it('recusa a palavra-passe errada e ficheiros alterados', async () => {
    const env = await encryptText('segredo', 'certa', { iterations: 2000 });
    await expect(decryptText(env, 'errada')).rejects.toBeInstanceOf(WrongPassphraseError);
    const tampered = { ...env, data: env.data.slice(0, -4) + 'AAAA' };
    await expect(decryptText(tampered, 'certa')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(isEncryptedEnvelope({ app: 'balcao-das-sucessoes', tables: {} })).toBe(false);
  });
  it('avalia a força da palavra-passe', () => {
    expect(passphraseStrength('abc').score).toBe(0);
    expect(passphraseStrength('abcdefgh').score).toBe(1);
    expect(passphraseStrength('Abcdefghijkl').score).toBe(3);
    expect(passphraseStrength('Abcdefghijk1!').score).toBe(4);
  });
});

describe('PIN', () => {
  it('verifica o PIN com sal e não guarda o PIN em claro', async () => {
    const rec = await hashPin('2468', 2000);
    expect(rec.hash).not.toContain('2468');
    expect(await verifyPin('2468', rec)).toBe(true);
    expect(await verifyPin('2469', rec)).toBe(false);
    const rec2 = await hashPin('2468', 2000);
    expect(rec2.hash).not.toBe(rec.hash); // sal diferente
  });
  it('impõe esperas crescentes após 5 falhas', () => {
    expect(lockoutSeconds(0)).toBe(0);
    expect(lockoutSeconds(4)).toBe(0);
    expect(lockoutSeconds(5)).toBe(30);
    expect(lockoutSeconds(6)).toBe(60);
    expect(lockoutSeconds(7)).toBe(120);
    expect(lockoutSeconds(20)).toBe(600);
  });
});

describe('modo privacidade', () => {
  it('reduz nomes a iniciais mantendo partículas', () => {
    expect(maskName('Maria Helena Dupont Silva')).toBe('M. H. D. S.');
    expect(maskName('João de Sousa')).toBe('J. de S.');
    expect(maskName('Banco Exemplo')).toBe('B. E.');
    expect(maskName('')).toBe('');
  });
});
