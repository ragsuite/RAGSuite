import type { PopoverAnchor } from '@/shared/components/adaptive/anchored-popover-layout';

/** Measure trigger bounds in window coordinates for anchored popovers/menus (native). */
export function measurePopoverAnchor(
  ref: unknown,
  callback: (anchor: PopoverAnchor) => void,
): void {
  const run = () => {
    const measurable = ref as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;

    measurable?.measureInWindow?.((left, top, width, height) => {
      callback({ top, left, width, height });
    });
  };

  requestAnimationFrame(run);
}

export function getWebViewportSize(): { width: number; height: number } {
  return { width: 0, height: 0 };
}
