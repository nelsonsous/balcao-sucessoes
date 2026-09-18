import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { newAsset, newDebt, newParty } from './db';
import {
  autoMap,
  buildRows,
  decodeText,
  detectDelimiter,
  ibanOk,
  importable,
  parseAssetType,
  parseBool,
  parseDateText,
  parseDebtStatus,
  parseKinship,
  parseMoney,
  parseOwnership,
  parseRoles,
  parseTable,
  splitRows,
  summarize,
  templateHeader,
  type Existing,
} from './sheetImport';
import type { AssetRecord, DebtRecord, PartyRecord } from './types';

const none: Existing = { parties: [], assets: [], debts: [] };
const rowsOf = (text: string, entity: 'parties' | 'assets' | 'debts', existing: Existing = none) => {
  const t = parseTable(text, entity);
  return buildRows(t, autoMap(t.header, entity), entity, existing);
};

describe('importação — leitura da folha', () => {
  it('deteta o separador: tabulação (colar do Excel), «;» (CSV português) ou «,»', () => {
    expect(detectDelimiter('Nome\tNIF\nAna\t1')).toBe('\t');
    expect(detectDelimiter('Nome;Valor\nAna;"1,5"')).toBe(';');
    expect(detectDelimiter('Nome,Valor\n"Silva; Ana",2')).toBe(',');
    expect(detectDelimiter('só uma coluna')).toBe(';');
  });

  it('aspas, aspas dobradas, quebras de linha dentro de células, CRLF, BOM e linhas vazias', () => {
    expect(splitRows('\uFEFFa;"b;c";"d ""e"""\r\n"x\ny";2\n\n  \n', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['x\ny', '2'],
    ]);
  });

  it('reconhece o cabeçalho sem acentos nem pontuação e completa linhas curtas', () => {
    const t = parseTable('N.º Contribuinte\tNome completo\tParentesco\tCC\n123456789\tMaria\n', 'parties');
    expect(t).toMatchObject({ hasHeader: true, delimiter: '\t', rows: [['123456789', 'Maria', '', '']] });
    expect(autoMap(t.header, 'parties')).toEqual(['nif', 'name', 'kinship', 'idDoc']);
    // cabeçalhos longos que começam por um nome conhecido
    expect(autoMap(['Valor patrimonial tributário (€)', 'Descrição do bem', 'Coisa'], 'assets')).toEqual(['value', 'description', '']);
    // cada campo só uma vez
    expect(autoMap(['Nome', 'Nome'], 'parties')).toEqual(['name', '']);
  });

  it('sem cabeçalho: colunas numeradas, todas as linhas são dados', () => {
    const t = parseTable('123456789;Maria;Filha\n234567899;João;Filho', 'parties');
    expect(t.hasHeader).toBe(false);
    expect(t.header).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']);
    expect(t.rows).toHaveLength(2);
  });

  it('ficheiros antigos do Excel em Windows-1252 leem-se com acentos', () => {
    expect(decodeText(new Uint8Array([0x43, 0x6f, 0x6e, 0x63, 0x65, 0x69, 0xe7, 0xe3, 0x6f]))).toBe('Conceição');
    expect(decodeText(new TextEncoder().encode('Conceição'))).toBe('Conceição');
  });

  it('propriedade: um CSV bem formado volta às mesmas células', () => {
    const cellArb = fc.string({ minLength: 1, maxLength: 12 }).map((s) => s.trim()).filter((s) => s.length > 0 && !s.includes('\uFEFF'));
    fc.assert(
      fc.property(fc.array(fc.array(cellArb, { minLength: 3, maxLength: 3 }), { minLength: 1, maxLength: 6 }), fc.constantFrom(';', ','), (rows, sep) => {
        const quote = (c: string) => (/[";,\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
        const text = rows.map((r) => r.map(quote).join(sep)).join('\r\n');
        expect(splitRows(text, sep)).toEqual(rows.map((r) => r.map((c) => c.trim())));
      }),
      { numRuns: 200 },
    );
  });
});

describe('importação — valores', () => {
  it('valores em euros em vários formatos', () => {
    expect(parseMoney('1.234,56 €')).toBe(1234.56);
    expect(parseMoney('1 234,56')).toBe(1234.56);
    expect(parseMoney('1,234.56')).toBe(1234.56);
    expect(parseMoney('1234.56')).toBe(1234.56);
    expect(parseMoney('1.234')).toBe(1234);
    expect(parseMoney('1.234.567')).toBe(1234567);
    expect(parseMoney('12.5')).toBe(12.5);
    expect(parseMoney('(1.000,00)')).toBe(-1000);
    expect(parseMoney('185 000 EUR')).toBe(185000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('datas: dd/mm/aaaa, ISO e número de série do Excel; texto livre mantém-se', () => {
    expect(parseDateText('1/3/1950')).toEqual({ value: '01/03/1950', invalid: false });
    expect(parseDateText('1950-03-12')).toEqual({ value: '12/03/1950', invalid: false });
    expect(parseDateText('12.03.1950')).toEqual({ value: '12/03/1950', invalid: false });
    expect(parseDateText('25569')).toEqual({ value: '01/01/1970', invalid: false });
    expect(parseDateText('31/02/1950')).toEqual({ value: '31/02/1950', invalid: true });
    expect(parseDateText('12/03/1950, Lisboa')).toEqual({ value: '12/03/1950, Lisboa', invalid: false });
  });

  it('parentesco, qualidade, tipo de bem, titularidade, estado da dívida e sim/não', () => {
    expect(parseKinship('Filha')).toBe('filho');
    expect(parseKinship('Viúva')).toBe('conjuge');
    expect(parseKinship('Unida de facto')).toBe('unido_facto');
    expect(parseKinship('Pai / Mãe')).toBe('progenitor');
    expect(parseKinship('')).toBe('');
    expect(parseKinship('vizinho')).toBeNull();
    expect(parseRoles('Herdeira / Cônjuge')).toEqual({ roles: ['herdeiro', 'conjuge'], unknown: [] });
    expect(parseRoles('Legatário e fiador')).toEqual({ roles: ['legatario'], unknown: ['fiador'] });
    expect(parseAssetType('Fração autónoma')).toBe('imoveis');
    expect(parseAssetType('Automóvel ligeiro')).toBe('veiculos');
    expect(parseAssetType('Certificados de Aforro')).toBe('aforro');
    expect(parseAssetType('Depósito a prazo')).toBe('contas');
    expect(parseAssetType('Quotas da sociedade')).toBe('participacoes');
    expect(parseAssetType('Quadro')).toBeNull();
    expect(parseOwnership('Bem próprio')).toBe('proprio');
    expect(parseOwnership('Bem comum do casal')).toBe('comum');
    expect(parseOwnership('Por classificar')).toBe('desconhecido');
    expect(parseOwnership('herdado')).toBeNull();
    expect(parseDebtStatus('Pago')).toBe('pago');
    expect(parseDebtStatus('Por confirmar')).toBe('por_confirmar');
    expect(parseDebtStatus('???')).toBeNull();
    expect(parseBool('X')).toBe(true);
    expect(parseBool('Não')).toBe(false);
  });

  it('IBAN com dígitos de controlo', () => {
    expect(ibanOk('PT50 0002 0123 1234 5678 9015 4')).toBe(true);
    expect(ibanOk('PT50000201231234567890155')).toBe(false);
    expect(ibanOk('GB82WEST12345698765432')).toBe(true);
    expect(ibanOk('12345')).toBe(false);
  });
});

describe('importação — linhas, avisos e repetidos', () => {
  it('interessados: valida NIF e e-mail (o valor fica nas notas), infere a qualidade do cônjuge e assinala erros', () => {
    const rows = rowsOf(
      [
        'Nome;NIF;Parentesco;Qualidade;E-mail;Nascimento;Cabeça-de-casal;Notas',
        'Maria Exemplo;123456789;Viúva;;maria@exemplo.pt;1950-03-12;Sim;cliente',
        'João Exemplo;123456788;Filho;Herdeiro;joao@;;;',
        ';234567899;Filha;;;;;',
      ].join('\n'),
      'parties',
    );
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4]);
    const [maria, joao, semNome] = rows;
    expect(maria!.values).toMatchObject({ name: 'Maria Exemplo', nif: '123456789', kinship: 'conjuge', roles: ['conjuge'], email: 'maria@exemplo.pt', birth: '12/03/1950', isHeadOfEstate: true, notes: 'cliente' });
    expect(maria!.errors).toEqual([]);
    expect(maria!.warnings).toEqual([]);
    expect(joao!.values).toMatchObject({ name: 'João Exemplo', kinship: 'filho', roles: ['herdeiro'] });
    expect((joao!.values as Partial<PartyRecord>).nif).toBeUndefined();
    expect(joao!.warnings).toEqual(['NIF «123456788» inválido: dígito de controlo errado', 'E-mail «joao@» inválido']);
    expect((joao!.values as Partial<PartyRecord>).notes).toBe('NIF indicado na folha: 123456788 (inválido: dígito de controlo errado)\nE-mail indicado na folha: joao@ (inválido)');
    expect(semNome!.errors).toEqual(['Falta o nome']);
  });

  it('repetidos: no dossier (mesmo NIF ou nome) e dentro da própria folha; cabeça-de-casal só uma vez', () => {
    const existing: Existing = { ...none, parties: [newParty('c', { name: 'Ana Maria Costa', nif: '234567899', isHeadOfEstate: true })] };
    const rows = rowsOf(['Nome\tNIF\tCabeça de casal', 'Outra Pessoa\t234567899\tsim', 'ana maria  costa\t\t', 'Rui Lopes\t\t', 'Rui Lopes\t\t'].join('\n'), 'parties', existing);
    expect(rows.map((r) => r.duplicate)).toEqual(['já existe no dossier («Ana Maria Costa»)', 'já existe no dossier («Ana Maria Costa»)', '', 'repete a linha 4']);
    expect(rows[0]!.warnings).toContain('Já há cabeça-de-casal no dossier: a marcação não é importada');
    expect((rows[0]!.values as Partial<PartyRecord>).isHeadOfEstate).toBe(false);
    expect(summarize(rows)).toEqual({ total: 4, ready: 1, withWarnings: 0, errors: 0, duplicates: 3 });
    expect(summarize(rows, true).ready).toBe(4);
    expect(importable(rows).map((r) => r.line)).toEqual([4]);
  });

  it('bens: tipo pela coluna ou deduzido, valores, IBAN, NIPC e país por omissão', () => {
    const rows = rowsOf(
      [
        'Descrição;Tipo;Valor;Matrícula;IBAN;NIPC;País;Artigo;Freguesia',
        'Apartamento T2;Fração;185.000,00;;;;;U-1234;Arroios',
        'Carro;;9.500;AA-00-AA;;;;;',
        'Conta à ordem;;"12 345,67";;PT50 0002 0123 1234 5678 9015 4;;;;',
        'Conta a prazo;;dez mil;;PT50000201231234567890155;;França;;',
        'Quadro antigo;Arte;-50;;;123;;;',
      ].join('\n'),
      'assets',
    );
    const v = rows.map((r) => r.values as Partial<AssetRecord>);
    expect(v[0]).toMatchObject({ type: 'imoveis', value: 185000, matrixArticle: 'U-1234', parish: 'Arroios', country: 'Portugal' });
    expect(v[1]).toMatchObject({ type: 'veiculos', value: 9500, plate: 'AA-00-AA' });
    expect(v[2]).toMatchObject({ type: 'contas', value: 12345.67, iban: 'PT50000201231234567890154' });
    expect(rows[2]!.warnings).toEqual([]);
    expect(v[3]).toMatchObject({ type: 'contas', country: 'França' });
    expect(v[3]!.value).toBeUndefined();
    expect(rows[3]!.warnings).toEqual(['Valor «dez mil» não é um número', 'IBAN «PT50000201231234567890155» com dígitos de controlo errados']);
    expect(v[4]).toMatchObject({ type: 'outro', value: -50 });
    expect(rows[4]!.warnings).toEqual(['Tipo «Arte» não reconhecido: fica como «outro»', 'Valor negativo — confirme (dívidas vão para «Dívidas»)', 'NIPC «123» inválido: o nif tem 9 dígitos']);
  });

  it('bens repetidos: mesmo artigo e freguesia, mesma matrícula ou mesmo IBAN', () => {
    const existing: Existing = { ...none, assets: [newAsset('c', { description: 'Casa', matrixArticle: 'U-1', parish: 'Sé' }), newAsset('c', { type: 'veiculos', description: 'Carro', plate: 'AA-00-AA' })] };
    const rows = rowsOf(['Descrição;Artigo;Freguesia;Matrícula', 'Moradia;U-1;Sé;', 'Mota;;;aa00aa', 'Terreno;U-1;Outra;'].join('\n'), 'assets', existing);
    expect(rows.map((r) => Boolean(r.duplicate))).toEqual([true, true, false]);
  });

  it('dívidas: valor sempre positivo, estado reconhecido, repetidas por credor e valor', () => {
    const existing: Existing = { ...none, debts: [newDebt('c', { creditor: 'Banco Exemplo', amount: 42300 })] };
    const rows = rowsOf(['Credor;Descrição;Valor;Garantia;Estado', 'Banco Exemplo;Crédito habitação;42.300,00;Hipoteca;confirmado', 'Finanças;IMI 2025;-310,50;;pago', 'Condomínio;;;;talvez'].join('\n'), 'debts', existing);
    const v = rows.map((r) => r.values as Partial<DebtRecord>);
    expect(rows[0]!.duplicate).toBe('já existe no dossier («Banco Exemplo»)');
    expect(v[1]).toMatchObject({ creditor: 'Finanças', description: 'IMI 2025', amount: 310.5, status: 'pago' });
    expect(rows[2]!.warnings).toEqual(['Estado «talvez» não reconhecido']);
  });

  it('modelo em branco com os nomes das colunas', () => {
    expect(templateHeader('debts')).toEqual(['Credor', 'Descrição', 'Valor (€)', 'Garantia', 'Estado', 'Notas']);
    // o modelo é reconhecido pela própria importação
    expect(autoMap(templateHeader('parties'), 'parties').every(Boolean)).toBe(true);
    expect(autoMap(templateHeader('assets'), 'assets').every(Boolean)).toBe(true);
  });
});
