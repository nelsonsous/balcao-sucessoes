// Posicionamento de menus e outros elementos flutuantes, em coordenadas do ecrã:
// alinha com o botão que os abre, troca de lado quando não cabem e nunca sai do ecrã.
// Função pura (testável); os componentes só medem e aplicam o resultado.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Altura máxima quando o conteúdo não cabe (o menu passa a ter deslocamento interno). */
  maxHeight: number | null;
  /** Largura máxima quando o conteúdo é mais largo do que o ecrã. */
  maxWidth: number | null;
  /** Lado do botão onde o menu ficou. */
  side: 'bottom' | 'top';
  /** Alinhamento horizontal efetivo (pode trocar se o preferido não couber). */
  align: 'left' | 'right';
}

export interface PlacementOptions {
  /** Distância ao botão, em px. */
  gap?: number;
  /** Margem mínima às bordas do ecrã, em px. */
  margin?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Calcula onde abrir um elemento flutuante de tamanho `size` junto a `anchor`, dentro de `viewport`.
 * `align: 'left'` alinha as margens esquerdas (o menu cresce para a direita); `'right'` alinha as direitas.
 */
export function placePopover(anchor: Rect, size: Size, viewport: Size, align: 'left' | 'right' = 'right', opts: PlacementOptions = {}): Placement {
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;
  const availW = Math.max(0, viewport.width - 2 * margin);
  const width = Math.min(size.width, availW);
  const fitsLeft = (x: number) => x >= margin && x + width <= viewport.width - margin;

  // Horizontal: alinhamento preferido; se não couber, o outro; por fim, encosta à margem.
  const preferred = align === 'right' ? anchor.right - width : anchor.left;
  const other = align === 'right' ? anchor.left : anchor.right - width;
  let effective: 'left' | 'right' = align;
  let left = preferred;
  if (!fitsLeft(preferred) && fitsLeft(other)) {
    left = other;
    effective = align === 'right' ? 'left' : 'right';
  }
  left = clamp(left, margin, viewport.width - margin - width);

  // Vertical: por baixo se couber; senão, do lado com mais espaço, com altura limitada.
  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  let side: 'bottom' | 'top' = 'bottom';
  let height = size.height;
  let maxHeight: number | null = null;
  if (size.height > below) {
    if (above > below) side = 'top';
    const space = Math.max(side === 'top' ? above : below, 0);
    if (size.height > space) {
      height = space;
      maxHeight = Math.max(space, 0);
    }
  }
  let top = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height;
  top = clamp(top, margin, viewport.height - margin - height);

  return {
    left: Math.round(left),
    top: Math.round(top),
    maxHeight: maxHeight === null ? null : Math.floor(maxHeight),
    maxWidth: size.width > availW ? Math.floor(availW) : null,
    side,
    align: effective,
  };
}

/** Verdadeiro se o retângulo `inner` está totalmente dentro de `outer` (com tolerância de 1 px). */
export function isInside(inner: Rect, outer: Rect): boolean {
  return inner.left >= outer.left - 1 && inner.top >= outer.top - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;
}
