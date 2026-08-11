import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Safe desktop fallback until web reports a valid inner width (hard-reload hydration). */
const WEB_DESKTOP_FALLBACK_WIDTH = 1280;

let lastKnownWebWidth = WEB_DESKTOP_FALLBACK_WIDTH;

function readWebInnerWidth(): number {
  if (typeof window === 'undefined') {
    return lastKnownWebWidth;
  }
  const w = window.innerWidth;
  if (Number.isFinite(w) && w > 0) {
    lastKnownWebWidth = w;
    return w;
  }
  return lastKnownWebWidth;
}

/**
 * Reliable viewport width on web — avoids `useWindowDimensions()` returning 0 on hard-reload,
 * which incorrectly flips every `width < 900` layout into compact/mobile mode.
 */
export function useStableViewportWidth(): number {
  const { width: rnWidth } = useWindowDimensions();
  const [webWidth, setWebWidth] = useState(() => (Platform.OS === 'web' ? readWebInnerWidth() : rnWidth));

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const update = () => {
      setWebWidth(readWebInnerWidth());
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (Platform.OS !== 'web') {
    return rnWidth;
  }

  if (Number.isFinite(rnWidth) && rnWidth > 0) {
    lastKnownWebWidth = rnWidth;
    return Math.max(rnWidth, webWidth);
  }

  return webWidth;
}

/** Convenience wrapper for compact breakpoints (uses full viewport — prefer useCompactLayout). */
export function useIsViewportCompact(breakpoint: number): boolean {
  const width = useStableViewportWidth();
  if (Platform.OS !== 'web') {
    return true;
  }
  return width < breakpoint;
}
