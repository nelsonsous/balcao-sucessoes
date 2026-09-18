import { describe, expect, it } from 'vitest';
import { csvName, toCsv } from './csv';

describe('CSV para Excel em português', () => {
  it('usa BOM, ponto e vírgula, vírgula decimal e CRLF', () => {
    const out = toCsv(['A', 'B', 'C'], [['x', 1234.5, true], ['y', null, false]]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toBe('\uFEFFA;B;C\r\nx;1234,5;Sim\r\ny;;Não\r\n');
  });
  it('escapa aspas, separadores e quebras de linha', () => {
    const out = toCsv(['T'], [['diz "olá"; adeus'], ['linha1\nlinha2']]);
    expect(out).toContain('"diz ""olá""; adeus"');
    expect(out).toContain('"linha1\nlinha2"');
  });
  it('neutraliza fórmulas', () => {
    expect(toCsv(['T'], [['=SUM(A1)'], ['+1'], ['-1'], ['@x']])).toBe("\uFEFFT\r\n'=SUM(A1)\r\n'+1\r\n'-1\r\n'@x\r\n");
  });
  it('gera nomes de ficheiro seguros', () => {
    expect(csvName('Relação de bens — BS-2026-001')).toMatch(/^relacao-de-bens-bs-2026-001-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
