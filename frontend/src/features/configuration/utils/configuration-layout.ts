import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Below this width the API keys table switches to card layout on web. */
export const CONFIGURATION_COMPACT_BREAKPOINT = 900;
/** Panel header actions (Create / Refresh) stack below the title. */
export const CONFIGURATION_HEADER_STACK_BREAKPOINT = 720;
/** n8n footer actions stack vertically. */
export const CONFIGURATION_ACTIONS_STACK_BREAKPOINT = 860;
/** Table gets horizontal scroll between compact and this width. */
export const CONFIGURATION_TABLE_SCROLL_BREAKPOINT = 1180;
/** Minimum table width when horizontal scroll is enabled. */
export const CONFIGURATION_TABLE_MIN_WIDTH = 920;

export function getConfigurationContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getConfigurationHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useConfigurationLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < CONFIGURATION_COMPACT_BREAKPOINT;
  const isNarrowWeb = isWeb && width < CONFIGURATION_HEADER_STACK_BREAKPOINT;
  const isHeaderStacked = (isWeb && width < CONFIGURATION_HEADER_STACK_BREAKPOINT) || isNativeMobile;
  const isActionsStacked =
    isNativeMobile || isCompactWeb || (isWeb && width < CONFIGURATION_ACTIONS_STACK_BREAKPOINT);
  const useCardLayout = isNativeMobile || isCompactWeb;
  const useTableLayout = isWeb && !isCompactWeb;
  const useTableHorizontalScroll =
    useTableLayout && width < CONFIGURATION_TABLE_SCROLL_BREAKPOINT;
  const isTabsEqualWidth = isNativeMobile || isCompactWeb;
  const showWebPageHeader = isWeb;
  const isCompactWebHeader = isCompactWeb;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isNarrowWeb,
    isHeaderStacked,
    isActionsStacked,
    useCardLayout,
    useTableLayout,
    useTableHorizontalScroll,
    isTabsEqualWidth,
    showWebPageHeader,
    isCompactWebHeader,
    contentMaxWidth: isWeb ? getConfigurationContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getConfigurationHorizontalPadding(width) : undefined,
    tableMinWidth: CONFIGURATION_TABLE_MIN_WIDTH,
  };
}
