type Bounds = { top: number; bottom: number; left: number; right: number };

export type MenuPlacement = { dropUp: boolean; alignRight: boolean };

function clips(value: string): boolean {
  return value !== '' && value !== 'visible';
}

/** Visible band for *element*: the viewport narrowed by every overflow-clipping ancestor. */
function clippingBounds(element: HTMLElement): Bounds {
  const bounds = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (!clips(style.overflowX) && !clips(style.overflowY)) continue;
    const rect = node.getBoundingClientRect();
    bounds.top = Math.max(bounds.top, rect.top);
    bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    bounds.left = Math.max(bounds.left, rect.left);
    bounds.right = Math.min(bounds.right, rect.right);
  }
  return bounds;
}

function overflow(start: number, end: number, bounds: Bounds): number {
  return Math.max(0, bounds.left - start) + Math.max(0, end - bounds.right);
}

/**
 * Flip the menu above / right-align it when the preferred side would be clipped.
 * The toolbar wraps differently per field width, so placement is measured on open.
 */
export function computeMenuPlacement(anchor: HTMLElement, menu: HTMLElement, preferRight: boolean): MenuPlacement {
  const bounds = clippingBounds(anchor);
  const anchorRect = anchor.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();

  const spaceBelow = bounds.bottom - anchorRect.bottom;
  const spaceAbove = anchorRect.top - bounds.top;
  const dropUp = height > spaceBelow && spaceAbove > spaceBelow;

  const leftOverflow = overflow(anchorRect.left, anchorRect.left + width, bounds);
  const rightOverflow = overflow(anchorRect.right - width, anchorRect.right, bounds);
  const alignRight = preferRight ? rightOverflow <= leftOverflow : rightOverflow < leftOverflow;
  return { dropUp, alignRight };
}
