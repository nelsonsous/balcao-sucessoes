import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { CaseRecord, MemberRecord, TaskRecord } from './types';
import {
  blockers,
  caseHealth,
  currentPhase,
  nextAction,
  taskStats,
  type Blockers,
  type Health,
  type TaskStats,
} from '../engine/insights';
import { isOpen } from '../engine/phases';

export function useMembers(): MemberRecord[] {
  return (
    useLiveQuery(async () => (await db.members.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt')), []) ?? []
  );
}

export function useMemberMap(): Map<string, MemberRecord> {
  const members = useMembers();
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
}

export interface CaseOverview {
  c: CaseRecord;
  tasks: TaskRecord[];
  stats: TaskStats;
  health: Health;
  next?: TaskRecord;
  nextDeadline?: TaskRecord;
  blockers: Blockers;
  phase?: TaskRecord['phase'];
}

export function buildOverview(c: CaseRecord, tasks: TaskRecord[]): CaseOverview {
  const stats = taskStats(tasks);
  const nextDeadline = tasks
    .filter((t) => !t.obsolete && isOpen(t.status) && t.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return {
    c,
    tasks,
    stats,
    health: c.stage === 'concluido' || c.stage === 'arquivado'
      ? { level: 'verde', label: c.stage === 'arquivado' ? 'Arquivado' : 'Concluído', detail: 'Dossier encerrado.' }
      : c.stage === 'suspenso'
        ? { level: 'cinzento', label: 'Suspenso', detail: 'Dossier suspenso.' }
        : caseHealth(stats),
    next: nextAction(tasks),
    nextDeadline,
    blockers: blockers(tasks),
    phase: currentPhase(tasks),
  };
}

/** Visão consolidada de todos os dossiers (tempo real). */
export function useOverviews(): CaseOverview[] | undefined {
  const data = useLiveQuery(async () => {
    const [cases, tasks] = await Promise.all([db.cases.toArray(), db.tasks.toArray()]);
    return { cases, tasks };
  }, []);
  return useMemo(() => {
    if (!data) return undefined;
    const byCase = new Map<string, TaskRecord[]>();
    for (const t of data.tasks) {
      const l = byCase.get(t.caseId);
      if (l) l.push(t);
      else byCase.set(t.caseId, [t]);
    }
    return data.cases
      .map((c) => buildOverview(c, byCase.get(c.id) ?? []))
      .sort((a, b) => b.c.updatedAt.localeCompare(a.c.updatedAt));
  }, [data]);
}

export const isActiveCase = (c: CaseRecord) => c.stage === 'ativo' || c.stage === 'suspenso';

// ---------------------------------------------------------------------------
// Instalação PWA

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitInstall();
  });
}

export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    () => deferredPrompt !== null,
    () => false,
  );
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    canPrompt,
    standalone,
    ios,
    async install() {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      emitInstall();
      return choice.outcome === 'accepted';
    },
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}
