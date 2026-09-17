// Bloqueio por PIN: estado partilhado (bloqueado/desbloqueado), auto-bloqueio
// por inatividade e tentativas falhadas com espera crescente.
import { useSyncExternalStore } from 'react';
import { lockoutSeconds, verifyPin, type PinRecord } from './crypto';
import { getSetting, setSetting } from './db';

const LOCKED_KEY = 'bs-locked';
const FAILS_KEY = 'bs-pin-fails';

interface LockState {
  locked: boolean;
  /** Tentativas falhadas consecutivas. */
  failed: number;
  /** Instante (ms) até ao qual novas tentativas são recusadas. */
  until: number;
}

let state: LockState = { locked: false, failed: 0, until: 0 };
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado */
  }
}
function set(next: Partial<LockState>): void {
  state = { ...state, ...next };
  write(LOCKED_KEY, state.locked);
  write(FAILS_KEY, { failed: state.failed, until: state.until });
  listeners.forEach((l) => l());
}

/** Arranque: com PIN definido, a aplicação abre sempre bloqueada. */
export async function initLock(): Promise<void> {
  const pin = await getSetting('pinJson');
  const fails = read<{ failed: number; until: number }>(FAILS_KEY, { failed: 0, until: 0 });
  set({ locked: Boolean(pin), failed: fails.failed, until: fails.until });
}

export function lockNow(): void {
  set({ locked: true });
}

export async function tryUnlock(pin: string): Promise<{ ok: boolean; waitSeconds: number }> {
  const raw = await getSetting('pinJson');
  if (!raw) {
    set({ locked: false, failed: 0, until: 0 });
    return { ok: true, waitSeconds: 0 };
  }
  const now = Date.now();
  if (state.until > now) return { ok: false, waitSeconds: Math.ceil((state.until - now) / 1000) };
  const rec = JSON.parse(raw) as PinRecord;
  if (await verifyPin(pin, rec)) {
    set({ locked: false, failed: 0, until: 0 });
    return { ok: true, waitSeconds: 0 };
  }
  const failed = state.failed + 1;
  const wait = lockoutSeconds(failed);
  set({ failed, until: wait ? now + wait * 1000 : 0 });
  return { ok: false, waitSeconds: wait };
}

export async function hasPin(): Promise<boolean> {
  return Boolean(await getSetting('pinJson'));
}

export async function clearPin(): Promise<void> {
  await setSetting('pinJson', '');
  set({ locked: false, failed: 0, until: 0 });
}

export function useLock(): LockState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Auto-bloqueio: chama `onIdle` após `minutes` sem interação (0 = desligado). Devolve a função de limpeza. */
export function watchIdle(minutes: number, onIdle: () => void): () => void {
  if (!minutes) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onIdle, minutes * 60 * 1000);
  };
  const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'focus'];
  for (const ev of events) window.addEventListener(ev, arm, { passive: true });
  arm();
  return () => {
    if (timer) clearTimeout(timer);
    for (const ev of events) window.removeEventListener(ev, arm);
  };
}
