import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
  TOOLBAR_CONTROL_HEIGHT,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export const COMPARE_MODELS_COMPACT_BREAKPOINT = 900;
export const COMPARE_MODELS_STACK_BREAKPOINT = COMPARE_MODELS_COMPACT_BREAKPOINT;
/** Web results grid uses three columns at xl (matches reference). */
export const COMPARE_MODELS_XL_BREAKPOINT = 1280;
/** Search + Compare stack vertically below this width on web. */
export const COMPARE_QUERY_STACK_BREAKPOINT = 640;
export const COMPARE_QUERY_CONTROL_HEIGHT = TOOLBAR_CONTROL_HEIGHT;

export function getCompareModelsContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getCompareModelsHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useCompareModelsLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < COMPARE_MODELS_COMPACT_BREAKPOINT;
  const isQueryBarStacked = isWeb && width < COMPARE_QUERY_STACK_BREAKPOINT;
  const isStackedResults = isNativeMobile || width < COMPARE_MODELS_STACK_BREAKPOINT;
  const resultColumns = isStackedResults ? 1 : width >= COMPARE_MODELS_XL_BREAKPOINT ? 3 : 2;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isQueryBarStacked,
    isStackedResults,
    contentMaxWidth: isWeb ? getCompareModelsContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getCompareModelsHorizontalPadding(width) : undefined,
    resultColumns,
  };
}
