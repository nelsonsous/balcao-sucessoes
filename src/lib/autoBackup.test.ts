import { beforeEach, describe, expect, it } from 'vitest';
import { AUTO_PREFIX, README_NAME, autoBackupName, autoBackupTick, hasPermission, isAutoBackupName, latestChangeAt, listAutoBackups, shouldRunAutoBackup, writeAutoBackup, type DirHandle } from './autoBackup';
import { readBackupText, wipeAll } from './backup';
import { db, getSetting, newCase, setSetting } from './db';

/** Pasta em memória com o subconjunto da File System Access API que a aplicação usa. */
class FakeDir implements DirHandle {
  name = 'Copias';
  files = new Map<string, string>();
  perm: PermissionState = 'granted';
  requested = 0;
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      this.files.set(name, '');
    }
    const files = this.files;
    return {
      getFile: async () => new File([files.get(name) ?? ''], name),
      createWritable: async () => {
        let buf = '';
        return {
          write: async (d: string | Blob) => {
            buf += typeof d === 'string' ? d : await d.text();
          },
          close: async () => {
            files.set(name, buf);
          },
        };
      },
    };
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
  async *keys() {
    yield* [...this.files.keys()];
  }
  async queryPermission() {
    return this.perm;
  }
  async requestPermission() {
    this.requested += 1;
    this.perm = 'granted';
    return this.perm;
  }
}

const NOW = new Date(2026, 8, 17, 10, 30); // 17/09/2026 10:30 local

async function seed() {
  await wipeAll();
  await db.cases.add(newCase({ id: 'c1', name: 'Sucessão Auto', ref: 'BS-A-1', updatedAt: '2026-09-17T08:00:00.000Z' }));
  await db.activity.add({ id: 'a1', caseId: 'c1', at: '2026-09-17T08:05:00.000Z', kind: 'dossier', text: 'Dossier criado', actor: 'Ana' });
}

describe('cópias automáticas', () => {
  beforeEach(seed);

  it('escreve uma cópia cifrada com nome datado, o LEIA-ME uma vez, e roda as mais antigas', async () => {
    const dir = new FakeDir();
    for (let i = 1; i <= 12; i++) dir.files.set(`${AUTO_PREFIX}2026-01-${String(i).padStart(2, '0')}-0900.cifrada.json`, '{}');
    dir.files.set('outro-ficheiro.json', 'não mexer');
    const r = await writeAutoBackup(dir, { passphrase: 'segredo-forte', includeFiles: false, keep: 10, now: NOW });
    expect(r.name).toBe('balcao-sucessoes-auto-2026-09-17-1030.cifrada.json');
    expect(autoBackupName(NOW)).toBe(r.name);
    expect(isAutoBackupName(r.name)).toBe(true);
    expect(isAutoBackupName('outro-ficheiro.json')).toBe(false);
    expect(r.cases).toBe(1);
    expect(r.removed).toEqual([`${AUTO_PREFIX}2026-01-01-0900.cifrada.json`, `${AUTO_PREFIX}2026-01-02-0900.cifrada.json`, `${AUTO_PREFIX}2026-01-03-0900.cifrada.json`]);
    const remaining = await listAutoBackups(dir);
    expect(remaining).toHaveLength(10);
    expect(remaining[remaining.length - 1]).toBe(r.name);
    expect(dir.files.get('outro-ficheiro.json')).toBe('não mexer');
    expect(dir.files.get(README_NAME)).toContain('cifrado');
    // conteúdo: só abre com a palavra-passe
    const text = dir.files.get(r.name)!;
    const ask = await readBackupText(text);
    expect('needsPassphrase' in ask).toBe(true);
    const ok = await readBackupText(text, 'segredo-forte');
    expect('backup' in ok && ok.backup.tables.cases?.length).toBe(1);
    // LEIA-ME não é reescrito
    dir.files.set(README_NAME, 'personalizado');
    await writeAutoBackup(dir, { passphrase: 'segredo-forte', includeFiles: false, keep: 10, now: new Date(2026, 8, 17, 10, 31) });
    expect(dir.files.get(README_NAME)).toBe('personalizado');
    await expect(writeAutoBackup(dir, { passphrase: '', includeFiles: false, keep: 10 })).rejects.toThrow(/palavra-passe/);
  }, 20_000);

  it('decide quando copiar consoante a frequência e a última alteração', () => {
    const base = { autoBackupEnabled: true, autoBackupEvery: 'diaria' as const, lastAutoBackupAt: '' };
    expect(shouldRunAutoBackup({ ...base, autoBackupEnabled: false }, '2026-09-17T08:00:00.000Z', NOW)).toBe(false);
    expect(shouldRunAutoBackup(base, '', NOW)).toBe(false); // sem dados
    expect(shouldRunAutoBackup(base, '2026-09-17T08:00:00.000Z', NOW)).toBe(true); // nunca copiou
    const last = '2026-09-17T07:00:00.000Z';
    expect(shouldRunAutoBackup({ ...base, lastAutoBackupAt: last }, '2026-09-17T06:00:00.000Z', NOW)).toBe(false); // nada mudou
    // diária: mesma data local → não; dia seguinte → sim
    expect(shouldRunAutoBackup({ ...base, lastAutoBackupAt: last }, '2026-09-17T08:00:00.000Z', NOW)).toBe(false);
    expect(shouldRunAutoBackup({ ...base, lastAutoBackupAt: last }, '2026-09-18T08:00:00.000Z', new Date(2026, 8, 18, 9))).toBe(true);
    // a cada alteração: só depois de 10 minutos
    const alt = { ...base, autoBackupEvery: 'alteracao' as const, lastAutoBackupAt: '2026-09-17T09:25:00.000Z' };
    expect(shouldRunAutoBackup(alt, '2026-09-17T09:26:00.000Z', new Date('2026-09-17T09:30:00.000Z'))).toBe(false);
    expect(shouldRunAutoBackup(alt, '2026-09-17T09:26:00.000Z', new Date('2026-09-17T09:36:00.000Z'))).toBe(true);
    // semanal
    const sem = { ...base, autoBackupEvery: 'semanal' as const, lastAutoBackupAt: '2026-09-10T09:00:00.000Z' };
    expect(shouldRunAutoBackup(sem, '2026-09-12T09:00:00.000Z', new Date('2026-09-16T09:00:00.000Z'))).toBe(false);
    expect(shouldRunAutoBackup(sem, '2026-09-12T09:00:00.000Z', new Date('2026-09-17T09:00:01.000Z'))).toBe(true);
  });

  it('ciclo do agendador: respeita o estado, a pasta, a permissão e o agendamento; regista o resultado', async () => {
    const dir = new FakeDir();
    expect((await autoBackupTick({ dir, now: NOW })).status).toBe('desligado');
    await setSetting('autoBackupEnabled', true);
    await setSetting('autoBackupPass', 'segredo-forte');
    await setSetting('autoBackupFiles', false);
    expect((await autoBackupTick({ dir: null, now: NOW })).status).toBe('sem-pasta');
    dir.perm = 'prompt';
    expect((await autoBackupTick({ dir, now: NOW })).status).toBe('sem-permissao');
    expect(await getSetting('autoBackupLastError')).toBe('permissao');
    expect(await hasPermission(dir)).toBe(false);
    expect(await hasPermission(dir, true)).toBe(true);
    expect(dir.requested).toBe(1);
    expect(await latestChangeAt()).toBe('2026-09-17T08:05:00.000Z');
    const first = await autoBackupTick({ dir, now: NOW });
    expect(first.status).toBe('feito');
    expect(first.result?.name).toBe('balcao-sucessoes-auto-2026-09-17-1030.cifrada.json');
    expect(await getSetting('lastAutoBackupAt')).toBe(NOW.toISOString());
    expect(await getSetting('lastBackupAt')).toBe(NOW.toISOString());
    expect(await getSetting('autoBackupLastError')).toBe('');
    // sem alterações: nada a fazer
    expect((await autoBackupTick({ dir, now: new Date(NOW.getTime() + 60_000) })).status).toBe('nada-a-fazer');
    // alteração + modo «a cada alteração» + 11 minutos depois → nova cópia
    await setSetting('autoBackupEvery', 'alteracao');
    await db.cases.update('c1', { updatedAt: new Date(NOW.getTime() + 2 * 60_000).toISOString() });
    expect((await autoBackupTick({ dir, now: new Date(NOW.getTime() + 5 * 60_000) })).status).toBe('nada-a-fazer');
    const second = await autoBackupTick({ dir, now: new Date(NOW.getTime() + 11 * 60_000) });
    expect(second.status).toBe('feito');
    expect(second.result?.name).toBe('balcao-sucessoes-auto-2026-09-17-1041.cifrada.json');
    expect(await listAutoBackups(dir)).toHaveLength(2);
    // «Copiar agora» ignora o agendamento e funciona mesmo desligado
    await setSetting('autoBackupEnabled', false);
    expect((await autoBackupTick({ dir, now: new Date(NOW.getTime() + 12 * 60_000) })).status).toBe('desligado');
    expect((await autoBackupTick({ dir, now: new Date(NOW.getTime() + 12 * 60_000), force: true })).status).toBe('feito');
    // erro registado (sem palavra-passe)
    await setSetting('autoBackupPass', '');
    const err = await autoBackupTick({ dir, force: true, now: new Date(NOW.getTime() + 13 * 60_000) });
    expect(err.status).toBe('erro');
    expect(await getSetting('autoBackupLastError')).toMatch(/palavra-passe/);
  }, 30_000);
});
