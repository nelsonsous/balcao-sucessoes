import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildDocx } from '../lib/docx';
import { categorize, clientCanProvide, desiredDocuments } from '../lib/documents';
import { newParty, newTask } from '../lib/db';
import { BUILTIN_TEMPLATES, blocksToText, bulletList, fillTemplate, parseBlocks, usedPlaceholders } from './templates';

describe('minutas', () => {
  it('preenche campos e marca os que faltam', () => {
    const { text, missing } = fillTemplate('Olá {{cliente.nome}}, óbito em {{falecido.data_obito}}.', { 'cliente.nome': 'Ana' });
    expect(text.startsWith('Olá Ana,')).toBe(true);
    expect(missing).toEqual(['falecido.data_obito']);
    const blocks = parseBlocks(text);
    const runs = blocks[0]!.lines[0]!;
    expect(runs.find((r) => r.missing)?.text).toBe('[Data do óbito]');
  });

  it('usa o rótulo dos parâmetros da minuta nos campos em falta', () => {
    const { text } = fillTemplate('Mandante: {{mandante.nome}}', {}, { 'mandante.nome': 'Mandante' });
    expect(parseBlocks(text)[0]!.lines[0]!.find((r) => r.missing)?.text).toBe('[Mandante]');
  });

  it('interpreta títulos, listas, negrito e quebras de linha', () => {
    const body = ['# Título', '', 'Linha 1', 'Linha **2**', '', '- item a', '- item b', '', '## Sub'].join('\n');
    const blocks = parseBlocks(body);
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'p', 'li', 'li', 'h2']);
    expect(blocks[1]!.lines).toHaveLength(2);
    expect(blocks[1]!.lines[1]!.find((r) => r.bold)?.text).toBe('2');
    expect(blocksToText(blocks)).toBe('TÍTULO\n\nLinha 1\nLinha 2\n\n• item a\n• item b\n\nSub');
  });

  it('listas vazias usam o texto alternativo', () => {
    expect(bulletList([], '(nada)')).toBe('(nada)');
    expect(bulletList(['a', 'b'], '')).toBe('- a\n- b');
  });

  it('todas as minutas-base usam campos conhecidos ou parâmetros declarados', async () => {
    const { PLACEHOLDERS } = await import('./templates');
    const known = new Set(PLACEHOLDERS.map((p) => p.key));
    for (const t of BUILTIN_TEMPLATES) {
      const params = new Set((t.params ?? []).map((p) => p.key));
      for (const k of usedPlaceholders(t.body + t.subject)) {
        expect(known.has(k) || params.has(k), `${t.id}: ${k}`).toBe(true);
      }
    }
  });
});

describe('docx', () => {
  it('gera um pacote OOXML válido com o texto escapado', () => {
    const bytes = buildDocx(parseBlocks('# Carta\n\nA & B <teste> "x"\n\n- item'), { title: 'Teste & Co' });
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'].sort(),
    );
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('A &amp; B &lt;teste&gt; &quot;x&quot;');
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="ListBullet"');
    expect(strFromU8(files['docProps/core.xml']!)).toContain('Teste &amp; Co');
  });
});

describe('checklist documental', () => {
  it('classifica documentos por palavras-chave', () => {
    expect(categorize('Certidão de óbito')).toBe('obito');
    expect(categorize('Caderneta predial')).toBe('patrimonio');
    expect(categorize('Declaração de saldos à data do óbito')).toBe('bancos');
    expect(categorize('Certidão de casamento')).toBe('familia');
    expect(categorize('Procuração forense assinada')).toBe('identificacao');
    expect(categorize('Certidão de óbito estrangeira (com formulário multilingue ou apostila)')).toBe('internacional');
    expect(categorize('Algo diferente')).toBe('outros');
  });

  it('distingue o que se pede ao cliente do que o escritório obtém', () => {
    expect(clientCanProvide({ name: 'Certidão de casamento', category: 'familia' })).toBe(true);
    expect(clientCanProvide({ name: 'Relação de bens', category: 'fiscal' })).toBe(false);
    expect(clientCanProvide({ name: 'Declaração de saldos à data do óbito', category: 'bancos' })).toBe(false);
    expect(clientCanProvide({ name: 'Pedido de informação sobre existência de testamento', category: 'testamento' })).toBe(false);
    expect(clientCanProvide({ name: 'Faturas do funeral', category: 'obito' })).toBe(true);
  });

  it('omite documentos genéricos dos herdeiros quando há interessados registados', () => {
    const tasks = [newTask('c', { docs: ['Documentos de identificação e NIF', 'NIF dos herdeiros', 'Certidão de óbito'] })];
    expect(desiredDocuments(tasks, []).map((d) => d.name)).toContain('NIF dos herdeiros');
    const withParty = desiredDocuments(tasks, [newParty('c', { name: 'Ana', roles: ['herdeiro'], kinship: 'filho' })]).map((d) => d.name);
    expect(withParty).not.toContain('NIF dos herdeiros');
    expect(withParty).not.toContain('Documentos de identificação e NIF');
    expect(withParty).toContain('Certidão de óbito');
  });

  it('gera documentos das tarefas e dos interessados, sem duplicados', () => {
    const tasks = [
      newTask('c', { docs: ['Certidão de óbito', 'Caderneta predial'] }),
      newTask('c', { docs: ['Certidão de óbito'] }),
      newTask('c', { docs: ['Ignorado'], status: 'na' }),
    ];
    const parties = [
      newParty('c', { name: 'Ana', roles: ['herdeiro'], kinship: 'filho' }),
      newParty('c', { name: 'Rui', roles: ['conjuge'], kinship: 'conjuge', poa: 'pedida' }),
      newParty('c', { name: 'Banco', roles: ['credor'], kind: 'coletiva' }),
    ];
    const docs = desiredDocuments(tasks, parties).map((d) => d.name);
    expect(docs).toEqual([
      'Certidão de óbito',
      'Caderneta predial',
      'Documento de identificação e NIF — Ana',
      'Certidão de nascimento — Ana',
      'Documento de identificação e NIF — Rui',
      'Certidão de casamento — Rui',
      'Procuração — Rui',
    ]);
  });
});
