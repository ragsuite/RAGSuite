import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as RNImage } from 'react-native';

import {
  fitLogoBox,
  getWidgetLogoFallbackSize,
  getWidgetLogoMaxBox,
  type WidgetLogoBoxSize,
  type WidgetLogoChromeSurface,
} from '@/features/app-chat-widget/utils/widget-logo-chrome';

type LogoLoadSource = {
  width?: number;
  height?: number;
};

/**
 * Normalize expo-image onLoad payloads (direct event data or RN synthetic event).
 */
export function readLogoLoadSource(event: unknown): LogoLoadSource | null {
  if (!event || typeof event !== 'object') return null;
  const maybe = event as {
    source?: LogoLoadSource;
    nativeEvent?: { source?: LogoLoadSource };
  };
  return maybe.source ?? maybe.nativeEvent?.source ?? null;
}

/**
 * Pure contain-fit from measured natural dimensions into the surface max box.
 * Returns null when dimensions are invalid (caller keeps square fallback).
 */
export function measureFittedLogoSize(
  naturalWidth: number,
  naturalHeight: number,
  surface: WidgetLogoChromeSurface,
): WidgetLogoBoxSize | null {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }
  const maxBox = getWidgetLogoMaxBox(surface);
  return fitLogoBox(
    naturalWidth,
    naturalHeight,
    maxBox.maxWidth,
    maxBox.maxHeight,
  );
}

/**
 * Measure a custom logo URL and contain-fit it into the surface max box.
 * Uses Image.getSize (reliable for cached URIs) plus onLoad as a secondary path.
 * Returns null size when disabled (no URL, or circle chrome — no aspect fit).
 */
export function useWidgetLogoFit(
  logoUrl: string | null | undefined,
  surface: WidgetLogoChromeSurface,
  enabled = true,
): {
  fittedSize: WidgetLogoBoxSize | null;
  onLogoLoad: ((event: unknown) => void) | undefined;
} {
  const trimmed = (logoUrl || '').trim();
  const active = enabled && Boolean(trimmed);
  const fallback = getWidgetLogoFallbackSize(surface);
  const [fittedSize, setFittedSize] = useState<WidgetLogoBoxSize>(fallback);
  /** Bumps whenever URL / surface / enabled changes so late getSize/onLoad are ignored. */
  const measureGenRef = useRef(0);

  useEffect(() => {
    const gen = ++measureGenRef.current;
    setFittedSize(getWidgetLogoFallbackSize(surface));
    if (!active || !trimmed) return;

    let cancelled = false;

    RNImage.getSize(
      trimmed,
      (width, height) => {
        if (cancelled || gen !== measureGenRef.current) return;
        const next = measureFittedLogoSize(width, height, surface);
        if (next) setFittedSize(next);
      },
      () => {
        // Keep square fallback; onLoad may still succeed.
      },
    );

    return () => {
      cancelled = true;
    };
  }, [trimmed, surface, active]);

  const onLogoLoad = useCallback(
    (event: unknown) => {
      if (!active) return;
      const gen = measureGenRef.current;
      const source = readLogoLoadSource(event);
      const width = source?.width;
      const height = source?.height;
      if (!width || !height) return;
      const next = measureFittedLogoSize(width, height, surface);
      if (!next) return;
      // Drop if a newer measure cycle started (URL/shape change).
      if (gen !== measureGenRef.current) return;
      setFittedSize(next);
    },
    [active, surface],
  );

  if (!active) {
    return { fittedSize: null, onLogoLoad: undefined };
  }

  return { fittedSize, onLogoLoad };
}
