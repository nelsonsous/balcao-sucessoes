import { describe, expect, it } from 'vitest';
import { wipeAll } from './backup';
import { encryptText } from './crypto';
import { db, newCase, newDocument, newParty, newTask } from './db';
import { attachFile } from './documents';
import { SHARE_APP, describePlan, dossierFileName, exportDossier, importDossier, parseDossier, planDossierImport, readDossierText, type DossierPackage } from './share';

const T0 = '2026-09-01T10:00:00.000Z';

async function seed() {
  await wipeAll();
  await db.members.add({ id: 'm1', name: 'Ana Silva', role: 'Advogada', color: '#0b7a5e', createdAt: T0 });
  const c = newCase({ id: 'c-share', name: 'Sucessão Partilha', ref: 'BS-P-1', responsibleId: 'm1', createdAt: T0, updatedAt: T0 });
  await db.cases.add(c);
  await db.tasks.add(newTask(c.id, { id: 't1', title: 'Certidão de óbito', phase: 'abertura', status: 'pendente', assigneeId: 'm1', createdAt: T0, updatedAt: T0 }));
  await db.parties.add(newParty(c.id, { id: 'p1', name: 'Maria', createdAt: T0, updatedAt: T0 }));
  const doc = newDocument(c.id, { id: 'd1', name: 'Certidão', category: 'obito', status: 'recebido', source: 'manual', key: 'certidao', partyId: 'p1', createdAt: T0, updatedAt: T0 });
  await db.documents.add(doc);
  await attachFile(doc, new Blob(['%PDF-1.4 partilha'], { type: 'application/pdf' }), 'certidao.pdf');
  await db.activity.where('caseId').equals(c.id).delete(); // o anexo regista uma entrada; fica só a nossa
  await db.activity.add({ id: 'a1', caseId: c.id, at: T0, kind: 'dossier', text: 'Dossier criado', actor: 'Ana' });
  await db.settings.put({ key: 'userName', value: 'Ana' });
  return c;
}

/** Exporta e devolve uma cópia independente (como se viesse de um ficheiro). */
async function packageFrom(caseId: string, includeFiles = true): Promise<DossierPackage> {
  return parseDossier(JSON.stringify(await exportDossier(caseId, { includeFiles })));
}

describe('partilha de dossier', () => {
  it('exporta o dossier com as tabelas, os membros referenciados e os anexos', async () => {
    const c = await seed();
    const pkg = await exportDossier(c.id);
    expect(pkg.app).toBe(SHARE_APP);
    expect(pkg.case.id).toBe(c.id);
    expect(pkg.exportedBy).toBe('Ana');
    expect(pkg.tables.tasks).toHaveLength(1);
    expect(pkg.tables.parties).toHaveLength(1);
    expect(pkg.tables.documents).toHaveLength(1);
    expect(pkg.tables.activity).toHaveLength(1);
    expect(pkg.members.map((m) => m.name)).toEqual(['Ana Silva']);
    expect(pkg.files).toHaveLength(1);
    expect(pkg.files[0]!.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    const light = await exportDossier(c.id, { includeFiles: false });
    expect(light.includesFiles).toBe(false);
    expect(light.files).toEqual([]);
    expect(dossierFileName(c, true, '2026-09-17')).toBe('dossier-bs-p-1-2026-09-17.cifrado.json');
    expect(dossierFileName({ ref: '', name: 'Sucessão Álvaro & Filhos' }, false, '2026-09-17')).toBe('dossier-sucessao-alvaro-filhos-2026-09-17.json');
    await expect(exportDossier('nao-existe')).rejects.toThrow(/não encontrado/);
  });

  it('valida o ficheiro e distingue cópias de segurança completas', () => {
    expect(() => parseDossier('{')).toThrow(/JSON/);
    expect(() => parseDossier('{"app":"outra"}')).toThrow(/não é um dossier partilhado/);
    expect(() => parseDossier('{"app":"balcao-das-sucessoes","tables":{}}')).toThrow(/cópia de segurança completa/);
    expect(() => parseDossier(JSON.stringify({ app: SHARE_APP, version: 99, case: { id: 'x', name: 'y' }, tables: {} }))).toThrow(/versão mais recente/);
    expect(() => parseDossier(JSON.stringify({ app: SHARE_APP, version: 1, case: { name: 'sem id' }, tables: {} }))).toThrow(/incompleto/);
    expect(() => parseDossier(JSON.stringify({ app: SHARE_APP, version: 1, case: { id: 'x', name: 'y' }, tables: { tasks: 'x' } }))).toThrow(/inválida/);
    // Ficheiro mínimo: os campos em falta ficam com valores por omissão e o caseId é forçado.
    const pkg = parseDossier(JSON.stringify({ app: SHARE_APP, version: 1, case: { id: 'x', name: 'Mínimo' }, tables: { tasks: [{ id: 't', caseId: 'outro', title: 'Tarefa' }, { semId: true }] } }));
    expect(pkg.case.answers.spouse).toBe('');
    expect(pkg.case.deceased.name).toBe('');
    expect(pkg.tables.tasks).toHaveLength(1);
    expect(pkg.tables.tasks[0]!.caseId).toBe('x');
    expect(pkg.tables.tasks[0]!.status).toBe('pendente');
    expect(pkg.exportedBy).toBe('colega');
  });

  it('lê ficheiros cifrados só com a palavra-passe certa', async () => {
    const c = await seed();
    const plain = JSON.stringify(await exportDossier(c.id, { includeFiles: false }));
    const env = JSON.stringify(await encryptText(plain, 'segredo-forte', { hint: 'a do costume', iterations: 2000 }));
    const ask = await readDossierText(env);
    expect('needsPassphrase' in ask && ask.needsPassphrase).toBe(true);
    expect('hint' in ask ? ask.hint : '').toBe('a do costume');
    await expect(readDossierText(env, 'errada')).rejects.toThrow(/incorreta/);
    const ok = await readDossierText(env, 'segredo-forte');
    expect('pkg' in ok && ok.pkg.case.name).toBe('Sucessão Partilha');
    const direct = await readDossierText(plain);
    expect('pkg' in direct).toBe(true);
  });

  it('importa num dispositivo onde o dossier não existe (com anexos, membros e histórico)', async () => {
    const c = await seed();
    const pkg = await packageFrom(c.id);
    await wipeAll();
    await db.settings.put({ key: 'userName', value: 'Rui' });
    const plan = await planDossierImport(pkg);
    expect(plan.exists).toBe(false);
    expect(plan.caseState).toBe('novo');
    expect(plan.totals).toEqual({ added: 4, updated: 0, kept: 0, same: 0 });
    expect(plan.files).toEqual({ added: 1, existing: 0, missing: 0 });
    expect(plan.members.added).toBe(1);
    expect(describePlan(plan)).toMatch(/Dossier novo neste dispositivo/);
    const r = await importDossier(pkg);
    expect(r.created).toBe(true);
    expect(r.added).toBe(4);
    expect(r.files).toBe(1);
    expect((await db.cases.get(c.id))!.name).toBe('Sucessão Partilha');
    expect(await db.tasks.count()).toBe(1);
    expect((await db.members.get('m1'))!.name).toBe('Ana Silva');
    const doc = (await db.documents.get('d1'))!;
    expect(await (await db.files.get(doc.fileId))!.blob.text()).toContain('partilha');
    const log = await db.activity.where('caseId').equals(c.id).toArray();
    expect(log.some((a) => a.text === 'Dossier criado')).toBe(true);
    const entry = log.find((a) => /Dossier importado de Ana/.test(a.text))!;
    expect(entry.actor).toBe('Rui');
    expect(entry.text).toMatch(/4 registos, 1 anexo/);
  });

  it('junta com deteção de conflitos: em cada registo ganha o mais recente e nada é apagado', async () => {
    const c = await seed();
    const pkg = await packageFrom(c.id);
    // Alterações locais depois da exportação
    await db.tasks.update('t1', { status: 'em_curso', updatedAt: '2026-09-05T09:00:00.000Z' });
    await db.tasks.add(newTask(c.id, { id: 't-local', title: 'Só existe aqui', phase: 'abertura', createdAt: T0, updatedAt: T0 }));
    // Alterações do colega (no ficheiro)
    pkg.tables.parties[0]!.name = 'Maria Santos';
    pkg.tables.parties[0]!.updatedAt = '2026-09-06T09:00:00.000Z';
    pkg.tables.tasks.push(newTask(c.id, { id: 't2', title: 'Tarefa do colega', phase: 'abertura', createdAt: T0, updatedAt: T0 }));
    pkg.tables.activity.push({ id: 'a2', caseId: c.id, at: '2026-09-06T09:00:00.000Z', kind: 'tarefa', text: 'Tarefa do colega criada', actor: 'Ana' });

    const plan = await planDossierImport(pkg, 'recente');
    expect(plan.exists).toBe(true);
    expect(plan.caseState).toBe('igual');
    expect(plan.tables.tasks).toEqual({ added: 1, updated: 0, kept: 1, same: 0 });
    expect(plan.tables.parties).toEqual({ added: 0, updated: 1, kept: 0, same: 0 });
    expect(plan.tables.activity).toEqual({ added: 1, updated: 0, kept: 0, same: 1 });
    expect(plan.tables.documents.same).toBe(1);
    expect(plan.conflicts).toBe(2);
    expect(plan.files.existing).toBe(1);
    expect(describePlan(plan)).toMatch(/ficha é igual/);

    const r = await importDossier(pkg, 'recente');
    expect(r.created).toBe(false);
    expect({ added: r.added, updated: r.updated, kept: r.kept, same: r.same }).toEqual({ added: 2, updated: 1, kept: 1, same: 2 });
    expect((await db.tasks.get('t1'))!.status).toBe('em_curso'); // local mais recente: mantida
    expect((await db.parties.get('p1'))!.name).toBe('Maria Santos'); // ficheiro mais recente: atualizada
    expect(await db.tasks.get('t2')).toBeTruthy(); // nova
    expect(await db.tasks.get('t-local')).toBeTruthy(); // nunca apagada
    expect(await db.files.count()).toBe(1);
    const log = await db.activity.where('caseId').equals(c.id).toArray();
    expect(log.some((a) => a.id === 'a2')).toBe(true);
    expect(log.find((a) => /Dossier juntado com a versão de Ana/.test(a.text))!.text).toMatch(/2 novos, 1 atualizados, 1 mantidos/);
  });

  it('estratégias «preferir o ficheiro» e «preferir este dispositivo», incluindo a ficha do dossier', async () => {
    const c = await seed();
    const pkg = await packageFrom(c.id);
    await db.tasks.update('t1', { status: 'em_curso', updatedAt: '2026-09-05T09:00:00.000Z' });
    await db.cases.update(c.id, { generalNotes: 'nota local', updatedAt: '2026-09-05T09:00:00.000Z' });
    pkg.tables.parties[0]!.name = 'Maria Santos';
    pkg.tables.parties[0]!.updatedAt = '2026-09-06T09:00:00.000Z';
    pkg.case.generalNotes = 'nota do colega';
    pkg.case.updatedAt = '2026-09-02T09:00:00.000Z';

    const recente = await planDossierImport(pkg, 'recente');
    expect(recente.caseState).toBe('local_mais_recente');
    expect(recente.caseApplied).toBe(false);
    expect(describePlan(recente)).toMatch(/ficha local é mais recente e será mantida/);

    const ficheiro = await planDossierImport(pkg, 'ficheiro');
    expect(ficheiro.caseApplied).toBe(true);
    expect(ficheiro.tables.tasks.updated).toBe(1);
    expect(ficheiro.tables.parties.updated).toBe(1);

    const local = await planDossierImport(pkg, 'local');
    expect(local.caseApplied).toBe(false);
    expect(local.totals).toEqual({ added: 0, updated: 0, kept: 2, same: 2 });
    await importDossier(pkg, 'local');
    expect((await db.tasks.get('t1'))!.status).toBe('em_curso');
    expect((await db.parties.get('p1'))!.name).toBe('Maria');
    expect((await db.cases.get(c.id))!.generalNotes).toBe('nota local');

    await importDossier(pkg, 'ficheiro');
    expect((await db.tasks.get('t1'))!.status).toBe('pendente');
    expect((await db.parties.get('p1'))!.name).toBe('Maria Santos');
    expect((await db.cases.get(c.id))!.generalNotes).toBe('nota do colega');
  });

  it('importa como novo dossier com identificadores novos e referências cruzadas mantidas', async () => {
    const c = await seed();
    // Um anexo cujo id contém o id de um documento («d1») e um mapa de partilha em JSON que refere o interessado:
    // o remapeamento tem de ser por valor completo, nunca por substring.
    await db.files.add({ id: 'file-d1-tail', blob: new Blob(['segundo'], { type: 'text/plain' }), name: 'nota.txt', type: 'text/plain', size: 7, createdAt: T0 });
    await db.documents.add(newDocument(c.id, { id: 'd2', name: 'Nota', category: 'outros', status: 'recebido', source: 'anexo', key: 'nota', fileId: 'file-d1-tail', fileName: 'nota.txt', fileType: 'text/plain', fileSize: 7, createdAt: T0, updatedAt: T0 }));
    await db.cases.update(c.id, { partilhaJson: JSON.stringify({ heirs: [{ partyId: 'p1', assets: ['bem-desconhecido'], note: 'texto com p1 no meio' }] }) });
    const pkg = await packageFrom(c.id);
    const plan = await planDossierImport(pkg, 'copia');
    expect(plan.exists).toBe(false);
    expect(plan.totals.added).toBe(5);
    expect(describePlan(plan)).toMatch(/dossier novo, com uma nova referência/);
    const r = await importDossier(pkg, 'copia');
    expect(r.created).toBe(true);
    expect(r.caseId).not.toBe(c.id);
    expect(await db.cases.count()).toBe(2);
    const copy = (await db.cases.get(r.caseId))!;
    expect(copy.ref).not.toBe('BS-P-1');
    expect(copy.ref).toMatch(/^BS-\d{4}-\d{3}$/);
    expect(copy.name).toBe('Sucessão Partilha');
    const docs = (await db.documents.where('caseId').equals(r.caseId).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const parties = await db.parties.where('caseId').equals(r.caseId).toArray();
    expect(docs).toHaveLength(2);
    const [certidao, nota] = docs as [(typeof docs)[number], (typeof docs)[number]];
    expect(certidao.id).not.toBe('d1');
    expect(certidao.partyId).toBe(parties[0]!.id); // referência cruzada remapeada
    expect(certidao.fileId).not.toBe((await db.documents.get('d1'))!.fileId);
    expect(await db.files.get(certidao.fileId)).toBeTruthy();
    expect(nota.fileId).not.toBe('file-d1-tail');
    expect(await (await db.files.get(nota.fileId))!.blob.text()).toBe('segundo');
    expect(await db.files.count()).toBe(4);
    const partilha = JSON.parse(copy.partilhaJson!) as { heirs: Array<{ partyId: string; assets: string[]; note: string }> };
    expect(partilha.heirs[0]!.partyId).toBe(parties[0]!.id);
    expect(partilha.heirs[0]!.assets).toEqual(['bem-desconhecido']); // id desconhecido fica igual
    expect(partilha.heirs[0]!.note).toBe('texto com p1 no meio'); // texto livre não é tocado
    // O original não foi tocado
    expect((await db.documents.get('d1'))!.partyId).toBe('p1');
    expect(await db.tasks.where('caseId').equals(c.id).count()).toBe(1);
    const log = await db.activity.where('caseId').equals(r.caseId).toArray();
    expect(log.some((a) => /como novo dossier/.test(a.text))).toBe(true);
  });

  it('documentos cujo anexo não vem no ficheiro ficam sem anexo (e o utilizador é avisado)', async () => {
    const c = await seed();
    const pkg = await packageFrom(c.id, false);
    await wipeAll();
    const plan = await planDossierImport(pkg);
    expect(plan.files).toEqual({ added: 0, existing: 0, missing: 1 });
    const r = await importDossier(pkg);
    expect(r.missingFiles).toBe(1);
    const doc = (await db.documents.get('d1'))!;
    expect(doc.fileId).toBe('');
    expect(doc.fileName).toBe('');
    expect(doc.status).toBe('recebido');
    // O ficheiro original de onde o pacote foi lido não foi alterado pela pré-visualização
    expect(pkg.tables.documents[0]!.fileId).not.toBe('');
    expect((await db.activity.where('caseId').equals(c.id).toArray()).some((a) => /1 anexo\(s\) não incluídos/.test(a.text))).toBe(true);
  });
});
