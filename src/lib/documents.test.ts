// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { db, newCase, newDocument, newParty, newTask } from './db';
import { addDocument, attachFile, categorize, clientCanProvide, deleteDocument, desiredDocuments, docStats, documentFromFile, formatBytes, removeAttachment, setDocumentStatus, syncDocuments, updateDocument } from './documents';

describe('checklist documental', () => {
  it('gera documentos a partir das tarefas e dos interessados, sem duplicados', async () => {
    const c = newCase({ name: 'Docs', ref: 'BS-D-1' });
    await db.cases.add(c);
    const tasks = [
      newTask(c.id, { title: 'A', phase: 'abertura', docs: ['Certidão de óbito', 'Certidão de óbito'], ruleKey: 'k1' }),
      newTask(c.id, { title: 'B', phase: 'abertura', docs: ['Caderneta predial'], ruleKey: 'k2', status: 'na' }),
    ];
    const parties = [newParty(c.id, { name: 'Ana Herdeira', roles: ['herdeiro'], kinship: 'filho' }), newParty(c.id, { name: 'Pequeno', roles: ['herdeiro'], kinship: 'neto', isMinor: true })];
    const desired = desiredDocuments(tasks, parties);
    const names = desired.map((d) => d.name);
    expect(names.filter((n) => n === 'Certidão de óbito')).toHaveLength(1);
    expect(names).not.toContain('Caderneta predial'); // tarefa N/A não exige documentos
    expect(names.some((n) => /Ana Herdeira/.test(n))).toBe(true);
    expect(names.some((n) => /representante|Pequeno/i.test(n))).toBe(true);

    await db.tasks.bulkAdd(tasks);
    await db.parties.bulkAdd(parties);
    const added = await syncDocuments(c.id);
    expect(added).toBeGreaterThan(2);
    expect(await syncDocuments(c.id)).toBe(0); // idempotente
    const docs = await db.documents.where('caseId').equals(c.id).toArray();
    expect(docs.every((d) => d.status === 'em_falta')).toBe(true);
    const stats = docStats(docs);
    expect(stats.total).toBe(docs.length);
  });

  it('muda estados com datas, edita, anexa e remove ficheiros', async () => {
    const c = newCase({ name: 'Docs2', ref: 'BS-D-2' });
    await db.cases.add(c);
    const d = await addDocument(c.id, 'Procuração forense', 'identificacao');
    expect(d.source).toBe('manual');
    await setDocumentStatus(d, 'pedido');
    expect((await db.documents.get(d.id))!.requestedAt).not.toBe('');
    await setDocumentStatus({ ...(await db.documents.get(d.id))! }, 'recebido');
    expect((await db.documents.get(d.id))!.receivedAt).not.toBe('');
    await updateDocument(d, { notes: 'original em mão' });
    expect((await db.documents.get(d.id))!.notes).toBe('original em mão');

    const current = (await db.documents.get(d.id))!;
    await attachFile(current, new Blob(['abc'], { type: 'text/plain' }), 'nota.txt');
    let after = (await db.documents.get(d.id))!;
    expect(after.fileId).not.toBe('');
    expect(after.fileName).toBe('nota.txt');
    expect(after.fileSize).toBe(3);
    expect(await db.files.count()).toBe(1);
    await removeAttachment(after);
    after = (await db.documents.get(d.id))!;
    expect(after.fileId).toBe('');
    expect(await db.files.count()).toBe(0);

    const fromFile = await documentFromFile(c.id, new File(['%PDF'], 'Certidão de nascimento.pdf', { type: 'application/pdf' }));
    expect(fromFile.category).toBe(categorize('Certidão de nascimento'));
    expect(fromFile.status).toBe('recebido');
    await deleteDocument(fromFile);
    expect(await db.documents.get(fromFile.id)).toBeUndefined();
    expect(await db.files.count()).toBe(0);
  });

  it('classifica documentos, sabe o que o cliente pode fornecer e formata tamanhos', () => {
    expect(categorize('Certidão de óbito')).toBe('obito');
    expect(categorize('Saldos à data do óbito — Banco X')).toBe('bancos');
    expect(categorize('Caderneta predial urbana')).toBe('patrimonio');
    expect(clientCanProvide(newDocument('c', { name: 'Cartão de cidadão do herdeiro', category: 'identificacao' }))).toBe(true);
    expect(clientCanProvide(newDocument('c', { name: 'Certificado Sucessório Europeu', category: 'internacional' }))).toBe(false);
    expect(formatBytes(0)).toMatch(/0/);
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toMatch(/^3[.,]0 MB$/);
  });
});
