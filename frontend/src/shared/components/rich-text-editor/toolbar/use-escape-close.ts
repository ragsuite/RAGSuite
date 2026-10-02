import { useEffect, useRef, type RefObject } from 'react';

const KEYUP_SWALLOW_MS = 1000;

/**
 * Escape closes an open editor popover without also closing the host sheet/modal
 * (those listen on `document` for keydown or keyup). Only reacts while *active*
 * and when focus is inside the same editor as *anchorRef*.
 */
export function useEscapeClose(active: boolean, onEscape: () => void, anchorRef: RefObject<HTMLElement | null>) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return undefined;
    let swallowTimer: ReturnType<typeof setTimeout> | undefined;
    const swallowKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      stopSwallowing();
    };
    const stopSwallowing = () => {
      document.removeEventListener('keyup', swallowKeyUp, true);
      if (swallowTimer) clearTimeout(swallowTimer);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const anchor = anchorRef.current;
      const scope = anchor?.closest('.rs-rte') ?? anchor;
      if (scope && event.target instanceof Node && !scope.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      document.addEventListener('keyup', swallowKeyUp, true);
      swallowTimer = setTimeout(stopSwallowing, KEYUP_SWALLOW_MS);
      onEscapeRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, anchorRef]);
}
