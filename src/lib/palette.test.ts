import { describe, expect, it } from 'vitest';
import { rankItems, scoreItem, type PaletteItem } from './palette';

const items: PaletteItem[] = [
  { id: 'nav-/', group: 'navegacao', title: 'Visão geral', href: '/' },
  { id: 'nav-/tarefas', group: 'navegacao', title: 'O que está a bloquear?', keywords: 'bloqueios atrasos', href: '/tarefas' },
  { id: 'act-nova', group: 'acoes', title: 'Nova sucessão', shortcut: 'N', href: '/dossiers/novo' },
  { id: 'case-1', group: 'dossiers', title: 'Sucessão Dupont-Silva', subtitle: 'BS-DEMO-001 · Maria Helena Dupont Silva', href: '/dossiers/1' },
  { id: 'task-1', group: 'tarefas', title: 'Participar o óbito às Finanças', subtitle: 'Tarefa · Sucessão Dupont-Silva', href: '/dossiers/1?tarefa=1' },
  { id: 'recent-case-1', group: 'recentes', title: 'Sucessão Dupont-Silva', href: '/dossiers/1' },
];

describe('paleta de comandos', () => {
  it('sem pesquisa mostra recentes, navegação e ações (não dossiers nem tarefas)', () => {
    const r = rankItems(items, '');
    expect(r.map((i) => i.group)).toEqual(['navegacao', 'navegacao', 'acoes', 'recentes']);
  });
  it('pesquisa sem acentos e por palavras em qualquer ordem', () => {
    expect(rankItems(items, 'sucessao dupont').map((i) => i.id)).toEqual(['case-1', 'task-1']);
    expect(rankItems(items, 'dupont sucessao')[0]!.id).toBe('case-1');
    expect(rankItems(items, 'BS-DEMO-001')[0]!.id).toBe('case-1');
  });
  it('dá prioridade ao início do título e às iniciais', () => {
    expect(rankItems(items, 'nova')[0]!.id).toBe('act-nova');
    expect(scoreItem(items[0]!, 'vg')).toBeGreaterThan(0);
    expect(rankItems(items, 'vg')[0]!.id).toBe('nav-/');
  });
  it('as palavras-chave contam e os recentes nunca aparecem em pesquisas', () => {
    expect(rankItems(items, 'atrasos')[0]!.id).toBe('nav-/tarefas');
    expect(rankItems(items, 'dupont').some((i) => i.group === 'recentes')).toBe(false);
    expect(rankItems(items, 'xyz')).toEqual([]);
  });
});
