// Teclado virtual (iPhone): no Safari do iOS a janela não encolhe quando o teclado abre — só a
// «visual viewport». Detetamos essa diferença com um campo de texto focado e marcamos o <body>
// com `keyboard-open`, para esconder a barra inferior que, de outro modo, tapava o campo.

const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'date', 'time', 'datetime-local', 'month', 'week', 'image', 'hidden']);

/** O elemento abre o teclado de texto quando focado? */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return !NON_TEXT.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}

/** Teclado provavelmente aberto: campo de texto focado e a área visível encolheu mais do que `threshold` px. */
export function keyboardLikelyOpen(layoutHeight: number, visualHeight: number, active: Element | null, threshold = 150): boolean {
  return isTextEntry(active) && layoutHeight - visualHeight > threshold;
}

interface VisualViewportLike extends EventTarget {
  height: number;
}

/** Observa o teclado virtual e mantém a classe `keyboard-open` no <body>. Devolve a função para parar. */
export function watchVirtualKeyboard(win: Window & { visualViewport?: VisualViewportLike | null } = window): () => void {
  const vv = win.visualViewport;
  const doc = win.document;
  if (!vv) return () => undefined;
  let frame = 0;
  const update = () => {
    const open = keyboardLikelyOpen(win.innerHeight, vv.height, doc.activeElement);
    doc.body.classList.toggle('keyboard-open', open);
  };
  const schedule = () => {
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  doc.addEventListener('focusin', schedule);
  doc.addEventListener('focusout', schedule);
  update();
  return () => {
    win.cancelAnimationFrame(frame);
    vv.removeEventListener('resize', schedule);
    doc.removeEventListener('focusin', schedule);
    doc.removeEventListener('focusout', schedule);
    doc.body.classList.remove('keyboard-open');
  };
}
