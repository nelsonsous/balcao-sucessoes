import { describe, expect, it } from 'vitest';
import { encryptText } from './crypto';
import { attachmentsSize, dataUrlToBlob, exportBackup, importBackup, parseBackup, readBackupText, wipeAll, BACKUP_APP } from './backup';
import { db, newCase, newDocument, newTask } from './db';
import { attachFile } from './documents';

async function seed() {
  await wipeAll();
  const c = newCase({ name: 'Sucessão Cópia', ref: 'BS-C-1' });
  await db.cases.add(c);
  await db.tasks.add(newTask(c.id, { title: 'Tarefa', phase: 'abertura' }));
  const doc = newDocument(c.id, { name: 'Certidão', category: 'obito', status: 'recebido', source: 'manual', key: 'certidao' });
  await db.documents.add(doc);
  await attachFile(doc, new Blob(['%PDF-1.4 conteúdo de teste'], { type: 'application/pdf' }), 'certidao.pdf');
  await db.settings.put({ key: 'userName', value: 'Ana' });
  return c;
}

describe('cópias de segurança', () => {
  it('exporta todas as tabelas e os anexos em base64', async () => {
    await seed();
    const b = await exportBackup({ includeFiles: true });
    expect(b.app).toBe(BACKUP_APP);
    expect(b.tables.cases).toHaveLength(1);
    expect(b.tables.tasks).toHaveLength(1);
    expect(b.tables.documents).toHaveLength(1);
    expect(b.includesFiles).toBe(true);
    const files = b.tables.files as Array<{ dataUrl: string }>;
    expect(files).toHaveLength(1);
    expect(files[0]!.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    const sem = await exportBackup({ includeFiles: false });
    expect(sem.tables.files).toBeUndefined();
    expect(sem.includesFiles).toBe(false);
    const size = await attachmentsSize();
    expect(size.count).toBe(1);
    expect(size.bytes).toBeGreaterThan(10);
  });

  it('importa em modo substituir e em modo juntar, repondo os anexos', async () => {
    const c = await seed();
    const json = JSON.stringify(await exportBackup({ includeFiles: true }));
    await wipeAll();
    expect(await db.cases.count()).toBe(0);
    const parsed = parseBackup(json);
    const r = await importBackup(parsed, 'replace');
    expect(r.cases).toBe(1);
    expect((await db.cases.get(c.id))!.name).toBe('Sucessão Cópia');
    expect(await db.files.count()).toBe(1);
    const file = (await db.files.toArray())[0]!;
    expect(await file.blob.text()).toContain('conteúdo de teste');
    // juntar: acrescenta um dossier novo sem apagar o existente
    const other = newCase({ name: 'Outro', ref: 'BS-C-2' });
    await db.cases.add(other);
    await importBackup(parsed, 'merge');
    expect(await db.cases.count()).toBe(2);
    // substituir: volta a ficar só o da cópia
    await importBackup(parsed, 'replace');
    expect(await db.cases.count()).toBe(1);
  });

  it('rejeita ficheiros que não são cópias e versões futuras', () => {
    expect(() => parseBackup('{')).toThrow(/JSON/);
    expect(() => parseBackup('{"app":"outra","tables":{}}')).toThrow(/não é uma cópia/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99, tables: {} }))).toThrow(/versão mais recente/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, tables: { cases: 'x' } }))).toThrow(/inválida/);
  });

  it('lê cópias cifradas só com a palavra-passe certa', async () => {
    await seed();
    const plain = JSON.stringify(await exportBackup({ includeFiles: false }));
    const env = JSON.stringify(await encryptText(plain, 'segredo-forte', { hint: 'a do costume', iterations: 2000 }));
    const ask = await readBackupText(env);
    expect('needsPassphrase' in ask && ask.needsPassphrase).toBe(true);
    expect('hint' in ask ? ask.hint : '').toBe('a do costume');
    await expect(readBackupText(env, 'errada')).rejects.toThrow(/incorreta/);
    const ok = await readBackupText(env, 'segredo-forte');
    expect('backup' in ok && ok.backup.tables.cases?.length).toBe(1);
    const direct = await readBackupText(plain);
    expect('backup' in direct).toBe(true);
  });

  it('converte data URLs em blobs com o tipo certo', async () => {
    const blob = dataUrlToBlob('data:text/plain;base64,' + btoa('ola'));
    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe('ola');
  });
});
