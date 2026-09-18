// Atalhos de teclado globais (lógica pura, testável): paleta, pesquisa, nova sucessão, ajuda
// e «G seguido de uma letra» para ir para uma página, como no Gmail ou no GitHub.

export type ShortcutAction = { type: 'palette' } | { type: 'search' } | { type: 'new' } | { type: 'help' } | { type: 'goto'; path: string };

/** «G» e depois a letra: ir para a página. */
export const GOTO: Array<{ key: string; path: string; label: string }> = [
  { key: 'v', path: '/', label: 'Visão geral' },
  { key: 'd', path: '/dossiers', label: 'Dossiers' },
  { key: 'a', path: '/agenda', label: 'Agenda' },
  { key: 'b', path: '/tarefas', label: 'O que está a bloquear?' },
  { key: 'm', path: '/minhas', label: 'As minhas tarefas' },
  { key: 'c', path: '/calculadora', label: 'Calculadora sucessória' },
  { key: 'p', path: '/prazos', label: 'Calculadora de prazos' },
  { key: 'r', path: '/regras', label: 'Regras do escritório' },
  { key: 's', path: '/definicoes', label: 'Definições' },
];

/** Tempo máximo entre o «G» e a letra. */
export const SEQUENCE_MS = 1500;

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
}

/** Onde as teclas são texto (campos, editores) ou pertencem a uma janela aberta. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el as Element).closest) return false;
  return Boolean((el as Element).closest('input, textarea, select, [contenteditable], [contenteditable="true"], dialog'));
}

/**
 * Cria o intérprete de teclas (guarda o «G» pendente). Devolve a ação a executar ou null.
 * `typing` indica que o foco está num campo de texto ou numa janela.
 */
export function createKeymap(now: () => number = () => Date.now()) {
  let gAt = 0;
  return (e: KeyLike, typing: boolean): ShortcutAction | null => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && k === 'k') return { type: 'palette' };
    if (typing || e.metaKey || e.ctrlKey || e.altKey) {
      gAt = 0;
      return null;
    }
    if (gAt && now() - gAt <= SEQUENCE_MS) {
      gAt = 0;
      const target = GOTO.find((g) => g.key === k);
      return target ? { type: 'goto', path: target.path } : null;
    }
    gAt = 0;
    if (e.key === '?') return { type: 'help' };
    if (e.key === '/') return { type: 'search' };
    if (k === 'g') {
      gAt = now();
      return null;
    }
    if (k === 'n') return { type: 'new' };
    return null;
  };
}

/** Evento para abrir a ajuda dos atalhos a partir de qualquer sítio (paleta, definições). */
export const HELP_EVENT = 'bs:atalhos';

export const openShortcutsHelp = (): void => {
  window.dispatchEvent(new Event(HELP_EVENT));
};

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Secções da ajuda (o que se vê no ecrã «Atalhos de teclado»). */
export function shortcutSections(mac = isMac()): Array<{ title: string; rows: Array<{ keys: string[][]; what: string }> }> {
  const mod = mac ? '⌘' : 'Ctrl';
  return [
    {
      title: 'Em toda a aplicação',
      rows: [
        { keys: [[mod, 'K']], what: 'Paleta de comandos (procurar e ir para qualquer sítio)' },
        { keys: [['/']], what: 'Pesquisar dossiers' },
        { keys: [['N']], what: 'Nova sucessão' },
        { keys: [[mod, 'Z']], what: 'Anular a última ação' },
        { keys: [['?']], what: 'Esta ajuda' },
        { keys: [['Esc']], what: 'Fechar a janela, o menu ou a folha aberta' },
      ],
    },
    {
      title: 'Ir para (G e depois a letra)',
      rows: GOTO.map((g) => ({ keys: [['G', g.key.toUpperCase()]], what: g.label })),
    },
    {
      title: 'Separadores do dossier',
      rows: [
        { keys: [['←'], ['→']], what: 'Separador anterior / seguinte' },
        { keys: [['Home'], ['End']], what: 'Primeiro / último separador' },
      ],
    },
    {
      title: 'Quadro de tarefas',
      rows: [
        { keys: [['↑'], ['↓'], ['←'], ['→']], what: 'Percorrer as tarefas' },
        { keys: [['Shift', '←'], ['Shift', '→']], what: 'Passar a tarefa para a coluna ao lado (muda o estado)' },
        { keys: [['Enter']], what: 'Abrir a tarefa' },
      ],
    },
    {
      title: 'Menus',
      rows: [
        { keys: [['↑'], ['↓']], what: 'Opção anterior / seguinte' },
        { keys: [['Home'], ['End']], what: 'Primeira / última opção' },
        { keys: [['Esc']], what: 'Fechar o menu e voltar ao botão' },
      ],
    },
  ];
}
