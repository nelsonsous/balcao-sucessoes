import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildDocx, tableBlock } from './docx';

describe('tabelas no .docx', () => {
  it('escreve uma tabela Office Open XML com cabeçalho, larguras e alinhamento', () => {
    const table = tableBlock(['Verba', 'Bem', 'Valor'], [['1', 'Casa', '200 000,00 €'], ['2', 'Conta & poupança', '1 000,00 €']], { align: ['right', 'left', 'right'], widths: [1, 4, 2] });
    const bytes = buildDocx([{ type: 'h1', lines: [[{ text: 'Relação' }]] }, table, { type: 'p', small: true, lines: [[{ text: 'nota' }]] }], { title: 'Teste' });
    const files = unzipSync(bytes);
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('<w:tbl>');
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(3);
    expect((xml.match(/<w:tc>/g) ?? []).length).toBe(9);
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:jc w:val="right"/>');
    expect(xml).toContain('Conta &amp; poupança');
    expect(xml).toContain('<w:pStyle w:val="Small"/>');
    // grelha: 3 colunas com larguras proporcionais (1:4:2 de 9070)
    const cols = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(cols.length).toBe(3);
    expect(cols[1]! > cols[2]! && cols[2]! > cols[0]!).toBe(true);
    expect(strFromU8(files['word/styles.xml']!)).toContain('w:styleId="Small"');
  });
});
