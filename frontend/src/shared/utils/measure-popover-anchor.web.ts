import type { PopoverAnchor } from '@/shared/components/adaptive/anchored-popover-layout';

export type PopoverPressEvent = {
  currentTarget?: unknown;
  nativeEvent?: {
    target?: unknown;
  };
};

type MeasurableElement = Element & {
  getBoundingClientRect: () => DOMRect;
};

export function anchorFromDomRect(rect: DOMRect): PopoverAnchor {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function isMeasurableElement(value: unknown): value is MeasurableElement {
  return (
    value != null &&
    typeof value === 'object' &&
    'getBoundingClientRect' in value &&
    typeof (value as MeasurableElement).getBoundingClientRect === 'function'
  );
}

/** Walk up from an inner text node to a measurable trigger element. */
export function findMeasurableElementFromTarget(target: unknown): MeasurableElement | null {
  let node = target as Element | null;
  while (node) {
    if (isMeasurableElement(node)) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

export function resolveViewDomNode(ref: unknown): MeasurableElement | null {
  if (isMeasurableElement(ref)) {
    return ref;
  }

  const host = ref as { node?: unknown; _node?: unknown } | null;
  if (host?.node && isMeasurableElement(host.node)) {
    return host.node;
  }
  if (host?._node && isMeasurableElement(host._node)) {
    return host._node;
  }

  return null;
}

export function measurePopoverAnchorFromPressEvent(
  event: PopoverPressEvent,
  callback: (anchor: PopoverAnchor) => void,
): boolean {
  const currentTarget = findMeasurableElementFromTarget(event.currentTarget);
  if (currentTarget) {
    callback(anchorFromDomRect(currentTarget.getBoundingClientRect()));
    return true;
  }

  const target = findMeasurableElementFromTarget(event.nativeEvent?.target);
  if (target) {
    callback(anchorFromDomRect(target.getBoundingClientRect()));
    return true;
  }

  return false;
}

export function getWebViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

/** Measure trigger bounds in viewport coordinates for anchored popovers/menus. */
export function measurePopoverAnchor(
  ref: unknown,
  callback: (anchor: PopoverAnchor) => void,
  event?: PopoverPressEvent,
): void {
  const run = () => {
    if (event && measurePopoverAnchorFromPressEvent(event, callback)) {
      return;
    }

    const domNode = resolveViewDomNode(ref);
    if (domNode) {
      callback(anchorFromDomRect(domNode.getBoundingClientRect()));
      return;
    }

    const measurable = ref as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    measurable?.measureInWindow?.((left, top, width, height) => {
      callback({ top, left, width, height });
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}
