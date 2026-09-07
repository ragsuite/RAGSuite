import { Platform } from 'react-native';

import {
  COMPACT_LAYOUT_BREAKPOINT,
  DETAIL_FULLSCREEN_BREAKPOINT,
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
  TOOLBAR_STACK_BREAKPOINT,
} from '@/shared/constants/layout';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export const FEEDBACK_COMPACT_BREAKPOINT = COMPACT_LAYOUT_BREAKPOINT;
export const FEEDBACK_TOOLBAR_STACK_BREAKPOINT = TOOLBAR_STACK_BREAKPOINT;
/** Shared height for search, filter, and export controls on web. */
export const FEEDBACK_WEB_TOOLBAR_HEIGHT = 40;
export const FEEDBACK_WEB_FILTER_WIDTH = 148;
export const FEEDBACK_DETAIL_FULLSCREEN_BREAKPOINT = DETAIL_FULLSCREEN_BREAKPOINT;
export const FEEDBACK_KPI_STACK_BREAKPOINT = 640;

export function getFeedbackContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getFeedbackHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useFeedbackLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < FEEDBACK_COMPACT_BREAKPOINT;
  const isToolbarStacked = isWeb && width < FEEDBACK_TOOLBAR_STACK_BREAKPOINT;
  const isDetailFullScreen = isWeb && width < FEEDBACK_DETAIL_FULLSCREEN_BREAKPOINT;
  /** Native + narrow web: 2×2 KPI grid instead of a single column. */
  const useKpiTwoColumnGrid = isNativeMobile || width < FEEDBACK_KPI_STACK_BREAKPOINT;
  const useFilterSheet = isNativeMobile || isCompactWeb;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isToolbarStacked,
    isDetailFullScreen,
    useKpiTwoColumnGrid,
    useFilterSheet,
    contentMaxWidth: isWeb ? getFeedbackContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getFeedbackHorizontalPadding(width) : undefined,
    /** Reference Feedback Sheet: `sm:max-w-2xl` */
    detailPanelWidth: isDetailFullScreen ? width : overlayTokens.width.sideSheetLg,
  };
}
