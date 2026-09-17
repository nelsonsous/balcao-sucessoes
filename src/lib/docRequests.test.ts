import { beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from './backup';
import { buildDocumentRequest, mailtoLink, requestTargets } from './docRequests';
import { bulkSetDocumentStatus, deleteDocuments, docStats, markRequested } from './documents';
import { db, newCase, newDocument, newParty } from './db';
import { clearUndo, undoLast } from './undo';

const parties = [
  newParty('c', { id: 'p1', name: 'Maria Silva', email: 'maria@exemplo.pt', isClient: true, roles: ['herdeiro'] }),
  newParty('c', { id: 'p2', name: 'João Silva', email: '', isClient: false, roles: ['herdeiro'] }),
  newParty('c', { id: 'p3', name: 'Empresa X', kind: 'coletiva', roles: ['outro'] }),
];
const docs = [
  newDocument('c', { id: 'd1', name: 'Certidão de óbito', status: 'em_falta', category: 'obito' }), // genérico, o cliente pode fornecer
  newDocument('c', { id: 'd2', name: 'Relação de bens', status: 'em_falta', category: 'fiscal' }), // escritório
  newDocument('c', { id: 'd3', name: 'Documento de identificação e NIF — Maria Silva', status: 'pedido', partyId: 'p1' }),
  newDocument('c', { id: 'd4', name: 'Certidão de nascimento — João Silva', status: 'em_falta', partyId: 'p2' }),
  newDocument('c', { id: 'd5', name: 'Procuração — João Silva', status: 'recebido', partyId: 'p2' }), // já recebido
];

describe('pedidos de documentos por interessado', () => {
  it('agrupa os documentos por quem os deve entregar', () => {
    const t = requestTargets(docs, parties);
    expect(t.map((x) => x.name)).toEqual(['Maria Silva', 'João Silva']);
    expect(t[0]!.isClient).toBe(true);
    expect(t[0]!.docs.map((d) => d.id)).toEqual(['d1', 'd3']); // genérico + próprio; nunca a relação de bens
    expect(t[1]!.docs.map((d) => d.id)).toEqual(['d4']); // o recebido não entra
    // sem interessado marcado como cliente, o cliente da ficha recebe os genéricos
    const t2 = requestTargets(docs, [parties[1]!], { name: 'Cliente Ficha', email: 'cliente@exemplo.pt' });
    expect(t2.map((x) => x.name)).toEqual(['Cliente Ficha', 'João Silva']);
    expect(t2[0]!.docs.map((d) => d.id)).toEqual(['d1']);
    expect(requestTargets([], parties)).toEqual([]);
  });

  it('gera o texto do pedido com a validade habitual das certidões e a ligação mailto', () => {
    const [target] = requestTargets(docs, parties);
    const r = buildDocumentRequest({ target: target!, deceasedName: 'António Silva', firmName: 'Fluencia Advogados', userName: 'Ana', until: '2026-10-01' });
    expect(r.subject).toBe('Documentos necessários — sucessão de António Silva');
    expect(r.body).toContain('Exmo.(a) Sr.(a) Maria Silva,');
    expect(r.body).toContain('• Certidão de óbito (certidão recente — validade habitual de 6 meses)');
    expect(r.body).toContain('• Documento de identificação e NIF — Maria Silva');
    expect(r.body).not.toContain('Relação de bens');
    expect(r.body).toContain('até 01/10/2026');
    expect(r.body.trim().endsWith('Ana\nFluencia Advogados')).toBe(true);
    const link = mailtoLink(target!.email, r.subject, r.body);
    expect(link.startsWith('mailto:maria%40exemplo.pt?subject=Documentos%20necess')).toBe(true);
    expect(link).toContain('&body=Exmo.');
    expect(mailtoLink('', 'a', 'b')).toBe('');
    // subconjunto escolhido
    const only = buildDocumentRequest({ target: target!, docs: [docs[0]!], deceasedName: '', firmName: 'F', userName: '' });
    expect(only.body).toContain('(nome do falecido)');
    expect(only.body).not.toContain('NIF — Maria');
    expect(only.body).toContain('A equipa');
  });
});

describe('estados em lote', () => {
  beforeEach(async () => {
    await wipeAll();
    clearUndo();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(newCase({ id: 'c', name: 'Sucessão Lote', ref: 'BS-L' }));
    await db.documents.bulkAdd(docs);
  });

  it('muda vários estados de uma vez, preenche as datas em falta, regista e pode ser anulado', async () => {
    const n = await bulkSetDocumentStatus(await db.documents.toArray(), 'pedido');
    expect(n).toBe(4); // d3 já estava «pedido»
    const after = await db.documents.toArray();
    expect(after.every((d) => d.status === 'pedido')).toBe(true);
    expect(after.find((d) => d.id === 'd1')!.requestedAt).not.toBe('');
    const log = await db.activity.where('caseId').equals('c').toArray();
    expect(log.some((a) => /4 documento\(s\) → Pedido \/ a aguardar/.test(a.text))).toBe(true);
    await undoLast();
    const back = await db.documents.toArray();
    expect(back.find((d) => d.id === 'd1')!.status).toBe('em_falta');
    expect(back.find((d) => d.id === 'd1')!.requestedAt).toBe('');
    expect(back.find((d) => d.id === 'd5')!.status).toBe('recebido');
    expect((await db.activity.where('caseId').equals('c').toArray()).some((a) => /^Anulado: 4 documento/.test(a.text))).toBe(true);
    // recebidos: data de receção preenchida
    await bulkSetDocumentStatus(back.filter((d) => d.id === 'd1' || d.id === 'd2'), 'recebido');
    expect((await db.documents.get('d1'))!.receivedAt).not.toBe('');
    expect(await bulkSetDocumentStatus([(await db.documents.get('d1'))!], 'recebido')).toBe(0);
  });

  it('marca um pedido por interessado e remove em lote para a reciclagem com um só anular', async () => {
    const [target] = requestTargets(await db.documents.toArray(), parties);
    const n = await markRequested(target!.docs, target!.name);
    expect(n).toBe(1); // d1 (d3 já era pedido)
    expect((await db.documents.get('d1'))!.status).toBe('pedido');
    expect((await db.activity.where('caseId').equals('c').toArray()).some((a) => /Pedido de 2 documento\(s\) a Maria Silva/.test(a.text))).toBe(true);
    const stats = docStats(await db.documents.toArray());
    expect(stats.requested).toBe(2);
    expect(stats).toMatchObject({ expiring: 0, expired: 0 });
    const removed = await deleteDocuments((await db.documents.toArray()).filter((d) => d.partyId === 'p2'));
    expect(removed).toBe(2);
    expect(await db.documents.count()).toBe(3);
    expect(await db.trash.count()).toBe(2);
    await undoLast();
    expect(await db.documents.count()).toBe(5);
    expect(await db.trash.count()).toBe(0);
  });
});
