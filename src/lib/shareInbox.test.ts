import { beforeEach, describe, expect, it } from 'vitest';
import { addInbox, clearInbox, inboxCount, itemTitle, listInbox, removeInbox, toFile } from './shareInbox';

describe('caixa de entrada de partilhas', () => {
  beforeEach(async () => {
    await clearInbox();
  });

  it('guarda, lista, conta e remove itens com ficheiros e ligações', async () => {
    expect(await inboxCount()).toBe(0);
    const id = await addInbox({ title: 'Certidão', text: '', url: '', at: '2026-09-17T10:00:00.000Z', files: [{ name: 'certidao.pdf', type: 'application/pdf', size: 12, blob: new Blob(['%PDF-1.4 abc'], { type: 'application/pdf' }) }] });
    await addInbox({ title: '', text: 'Ver este artigo', url: 'https://exemplo.pt/artigo', at: '2026-09-17T10:05:00.000Z', files: [] });
    expect(await inboxCount()).toBe(2);
    const items = await listInbox();
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe(id);
    expect(items[0]!.files[0]!.name).toBe('certidao.pdf');
    const f = toFile(items[0]!.files[0]!);
    expect(f.name).toBe('certidao.pdf');
    expect(f.type).toBe('application/pdf');
    expect(await f.text()).toBe('%PDF-1.4 abc');
    expect(itemTitle(items[0]!)).toBe('Certidão');
    expect(itemTitle(items[1]!)).toBe('https://exemplo.pt/artigo');
    expect(itemTitle({ title: '', text: 'só texto', url: '', files: [], at: '' })).toBe('só texto');
    expect(itemTitle({ title: '', text: '', url: '', files: [], at: '' })).toBe('Partilha recebida');
    await removeInbox(id);
    expect(await inboxCount()).toBe(1);
    await clearInbox();
    expect(await listInbox()).toEqual([]);
  });
});
