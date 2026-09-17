import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
  TOOLBAR_CONTROL_HEIGHT,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export const COMPARE_MODELS_COMPACT_BREAKPOINT = 900;
export const COMPARE_MODELS_STACK_BREAKPOINT = COMPARE_MODELS_COMPACT_BREAKPOINT;
export const COMPARE_MODELS_XL_BREAKPOINT = 1280;
export const COMPARE_QUERY_STACK_BREAKPOINT = 640;
export const COMPARE_QUERY_CONTROL_HEIGHT = TOOLBAR_CONTROL_HEIGHT;
export const COMPARE_RESULT_CARD_PEEK = 48;
export const COMPARE_RESULT_CARD_MAX_WIDTH = 420;

export function getCompareModelsContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getCompareModelsHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function getCompareResultCardWidth(availableWidth: number): number {
  if (availableWidth <= 0) return COMPARE_RESULT_CARD_MAX_WIDTH;
  const peek = availableWidth < 380 ? 28 : COMPARE_RESULT_CARD_PEEK;
  const withPeek = availableWidth - Math.min(peek, Math.floor(availableWidth * 0.15));
  return Math.min(COMPARE_RESULT_CARD_MAX_WIDTH, Math.max(1, Math.round(withPeek)));
}

export function useCompareModelsLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < COMPARE_MODELS_COMPACT_BREAKPOINT;
  const isQueryBarStacked = width < COMPARE_QUERY_STACK_BREAKPOINT;
  const isStackedResults = isNativeMobile || width < COMPARE_MODELS_STACK_BREAKPOINT;
  const resultColumns = isStackedResults ? 1 : width >= COMPARE_MODELS_XL_BREAKPOINT ? 3 : 2;
  const horizontalPadding = isWeb ? getCompareModelsHorizontalPadding(width) : 16;
  const contentMaxWidth = isWeb ? getCompareModelsContentMaxWidth(width) : width;
  const availableWidth = Math.max(
    0,
    Math.min(width, contentMaxWidth ?? width) - horizontalPadding * 2,
  );
  const resultCardWidth = getCompareResultCardWidth(availableWidth);
  const chipMaxVisible = isNativeMobile || width < COMPARE_QUERY_STACK_BREAKPOINT ? 2 : isCompactWeb ? 3 : 4;
  const resultBodyMaxHeight = Math.min(480, Math.max(220, Math.round(width * 0.5)));

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isQueryBarStacked,
    isStackedResults,
    contentMaxWidth: isWeb ? contentMaxWidth : undefined,
    horizontalPadding: isWeb ? horizontalPadding : undefined,
    resultColumns,
    resultCardWidth,
    chipMaxVisible,
    resultBodyMaxHeight,
    availableWidth,
  };
}
