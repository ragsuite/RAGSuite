import { Platform } from 'react-native';

import {
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
} from '@/shared/constants/layout';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Web uses compact overlays, stacked toolbar, and full-width detail below this width. */
export const CHAT_HISTORY_COMPACT_BREAKPOINT = 900;

/** Search + export stack vertically below this width. */
export const CHAT_HISTORY_TOOLBAR_STACK_BREAKPOINT = 640;

/** Detail side panel becomes full-width below this width. */
export const CHAT_HISTORY_DETAIL_FULLSCREEN_BREAKPOINT = 768;

/** Query rows wrap tag/meta more aggressively below this width. */
export const CHAT_HISTORY_ROW_COMPACT_BREAKPOINT = 720;

export function isChatHistoryWebPlatform(): boolean {
  return Platform.OS === 'web';
}

export function getChatHistoryContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getChatHistoryHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useChatHistoryLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = isChatHistoryWebPlatform();
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < CHAT_HISTORY_COMPACT_BREAKPOINT;
  const isToolbarStacked = isWeb && width < CHAT_HISTORY_TOOLBAR_STACK_BREAKPOINT;
  const isDetailFullScreen = isWeb && width < CHAT_HISTORY_DETAIL_FULLSCREEN_BREAKPOINT;
  const isRowCompact = isWeb && width < CHAT_HISTORY_ROW_COMPACT_BREAKPOINT;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isToolbarStacked,
    isDetailFullScreen,
    isRowCompact,
    contentMaxWidth: isWeb ? getChatHistoryContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getChatHistoryHorizontalPadding(width) : undefined,
    detailPanelWidth: isDetailFullScreen ? width : overlayTokens.width.sideSheetLg,
  };
}
