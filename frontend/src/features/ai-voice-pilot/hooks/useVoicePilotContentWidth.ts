import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/**
 * Prefer measured panel width (settings sidebar / embedded) over window width.
 * Falls back to layout viewport until the first onLayout.
 */
export function useVoicePilotContentWidth() {
  const fallback = useLayoutViewportWidth();
  const [measured, setMeasured] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next <= 0) return;
    setMeasured((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

  return {
    width: measured > 0 ? measured : fallback,
    measured: measured > 0,
    onLayout,
  };
}

/** Carousel orb size/slots so the viewport never exceeds content width. */
export function voiceCarouselMetrics(contentWidth: number): {
  itemSize: number;
  visibleSlots: number;
  compact: boolean;
} {
  const width = contentWidth > 0 ? contentWidth : 720;

  if (width < 400) {
    const itemSize = Math.max(96, Math.min(132, width - 8));
    return { itemSize, visibleSlots: 1, compact: true };
  }
  if (width < 560) {
    return { itemSize: 120, visibleSlots: 3, compact: true };
  }
  if (width < 720) {
    return { itemSize: 132, visibleSlots: 3, compact: true };
  }
  if (width >= 176 * 5) {
    return { itemSize: 176, visibleSlots: 5, compact: false };
  }
  if (width >= 176 * 3) {
    return { itemSize: 176, visibleSlots: 3, compact: true };
  }
  const itemSize = Math.max(100, Math.floor(width / 3));
  return { itemSize, visibleSlots: 3, compact: true };
}

/** Side-by-side config only when the panel itself is wide enough. */
export function voiceConfigIsWide(contentWidth: number): boolean {
  return contentWidth >= 900;
}

/** Stack filter toolbars / hint rows when the panel is narrow. */
export function voicePanelIsNarrow(contentWidth: number): boolean {
  return contentWidth < 720;
}
