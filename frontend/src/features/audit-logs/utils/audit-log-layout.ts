import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Web uses card list, filter sheet, and compact chrome below this width. */
export const AUDIT_LOGS_COMPACT_BREAKPOINT = 900;

/** Search stacks above filters below this width. */
export const AUDIT_LOGS_TOOLBAR_STACK_BREAKPOINT = 720;

/** Filter row scrolls horizontally below this width (inline toolbar only). */
export const AUDIT_LOGS_FILTER_SCROLL_BREAKPOINT = 1080;

/** Detail side panel becomes full-width below this width. */
export const AUDIT_LOGS_DETAIL_FULLSCREEN_BREAKPOINT = 768;

/** Minimum width for the audit table (sum of column minWidths + padding). */
export const AUDIT_LOGS_TABLE_MIN_WIDTH = 780;

/** Below this width, table rows scroll horizontally instead of wrapping. */
export const AUDIT_LOGS_TABLE_HORIZONTAL_SCROLL_BREAKPOINT = 1100;

export function isAuditLogsWebPlatform(): boolean {
  return Platform.OS === 'web';
}

export function getAuditLogsContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getAuditLogsHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useAuditLogsLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = isAuditLogsWebPlatform();
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < AUDIT_LOGS_COMPACT_BREAKPOINT;
  const isToolbarStacked = isWeb && width < AUDIT_LOGS_TOOLBAR_STACK_BREAKPOINT;
  const isFilterScroll = isWeb && width < AUDIT_LOGS_FILTER_SCROLL_BREAKPOINT;
  const isDetailFullScreen = isWeb && width < AUDIT_LOGS_DETAIL_FULLSCREEN_BREAKPOINT;
  const useCardLayout = isNativeMobile || isCompactWeb;
  const useFilterSheet = isNativeMobile || isCompactWeb;
  const useTableLayout = isWeb && !isCompactWeb;
  const needsTableHorizontalScroll =
    useTableLayout && width < AUDIT_LOGS_TABLE_HORIZONTAL_SCROLL_BREAKPOINT;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isToolbarStacked,
    isFilterScroll,
    isDetailFullScreen,
    useCardLayout,
    useFilterSheet,
    useTableLayout,
    needsTableHorizontalScroll,
    tableMinWidth: AUDIT_LOGS_TABLE_MIN_WIDTH,
    contentMaxWidth: isWeb ? getAuditLogsContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getAuditLogsHorizontalPadding(width) : undefined,
    detailPanelWidth: isDetailFullScreen ? width : overlayTokens.width.sideSheetForm,
  };
}
