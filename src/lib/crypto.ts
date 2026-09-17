// Criptografia local (Web Crypto): cópias de segurança cifradas com AES-GCM
// e verificação do PIN com PBKDF2. Nada sai do dispositivo.

const te = new TextEncoder();
const td = new TextDecoder();

export const ENCRYPTED_FORMAT = 'balcao-das-sucessoes/encrypted';
export const PBKDF2_ITERATIONS = 250_000;

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT;
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** Texto cifrado em base64 (inclui a etiqueta de autenticação). */
  data: string;
  createdAt: string;
  /** Pista opcional escolhida por quem cifrou (nunca a palavra-passe). */
  hint?: string;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

/** Cifra um texto (normalmente JSON) com uma palavra-passe. */
export async function encryptText(plain: string, passphrase: string, opts: { hint?: string; iterations?: number } = {}): Promise<EncryptedEnvelope> {
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, iterations, ['encrypt']);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, te.encode(plain)));
  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(data),
    createdAt: new Date().toISOString(),
    ...(opts.hint ? { hint: opts.hint } : {}),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Palavra-passe incorreta ou ficheiro danificado.');
    this.name = 'WrongPassphraseError';
  }
}

/** Decifra um envelope; lança WrongPassphraseError se a palavra-passe não bater. */
export async function decryptText(env: EncryptedEnvelope, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, fromBase64(env.kdf.salt), env.kdf.iterations, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.cipher.iv) as BufferSource }, key, fromBase64(env.data) as BufferSource);
    return td.decode(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  const e = v as Partial<EncryptedEnvelope> | null;
  return Boolean(e && e.format === ENCRYPTED_FORMAT && e.version === 1 && e.kdf && e.cipher && typeof e.data === 'string');
}

/** Força de uma palavra-passe (0–4) para orientar o utilizador. */
export function passphraseStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (p.length >= 8) score += 1;
  if (p.length >= 12) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/\d/.test(p) && /[^a-zA-Z0-9]/.test(p)) score += 1;
  const labels = ['Demasiado curta', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: labels[s] };
}

// ---------------------------------------------------------------------------
// PIN

export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

async function pinDigest(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, 256);
  return toBase64(new Uint8Array(bits));
}

export async function hashPin(pin: string, iterations = 100_000): Promise<PinRecord> {
  const salt = randomBytes(16);
  return { salt: toBase64(salt), hash: await pinDigest(pin, salt, iterations), iterations };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const h = await pinDigest(pin, fromBase64(rec.salt), rec.iterations);
  // comparação em tempo constante (o tamanho é fixo)
  if (h.length !== rec.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

/** Espera imposta após tentativas falhadas: 0 até 4 falhas, depois cresce (30 s, 60 s, 2 min, … até 10 min). */
export function lockoutSeconds(failed: number): number {
  if (failed < 5) return 0;
  return Math.min(600, 30 * 2 ** (failed - 5));
}
