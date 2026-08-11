import { Platform, useWindowDimensions } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export const APP_CHAT_WIDGET_PANEL_WIDTH = 448;
export const APP_CHAT_WIDGET_MOBILE_BREAKPOINT = 768;
export const APP_CHAT_WIDGET_NARROW_BREAKPOINT = 480;
export const APP_CHAT_WIDGET_LAUNCHER_GAP = 12;
export const APP_CHAT_WIDGET_HORIZONTAL_INSET = 20;
/** Match reference EmbeddableWidget floor (Math.max(widgetZIndex, 99999)). */
export const APP_CHAT_WIDGET_HOST_Z_INDEX = 99999;

export function getAppChatWidgetLauncherSize(avatarSize: number): number {
  const size = avatarSize > 0 ? avatarSize : 38;
  return Math.max(32, Math.min(64, size));
}

export function getAppChatWidgetPanelMetrics(
  width: number,
  height: number,
  insets: Pick<EdgeInsets, 'top' | 'bottom' | 'left' | 'right'>,
  options?: {
    customWidth?: { enabled: boolean; width: number };
    widgetBottomSpace?: number;
    launcherSize?: number;
    reserveLauncherSpace?: boolean;
  },
) {
  // Width breakpoint only — same on web, phone, and tablet (reference parity).
  const isMobileLayout = width < APP_CHAT_WIDGET_MOBILE_BREAKPOINT;
  const isNarrow = width < APP_CHAT_WIDGET_NARROW_BREAKPOINT;
  const isNative = Platform.OS !== 'web';

  const horizontalMargin = isNarrow
    ? 8
    : isMobileLayout
      ? APP_CHAT_WIDGET_HORIZONTAL_INSET
      : Math.max(APP_CHAT_WIDGET_HORIZONTAL_INSET, insets.left, insets.right);

  const configuredWidth = options?.customWidth?.enabled
    ? options.customWidth.width
    : APP_CHAT_WIDGET_PANEL_WIDTH;
  const panelWidth = isMobileLayout
    ? width - horizontalMargin * 2
    : Math.min(Math.max(configuredWidth, 320), 900, width - horizontalMargin * 2);

  const launcherSize = options?.launcherSize ?? 38;
  const widgetBottomSpace = options?.widgetBottomSpace ?? 0;
  const reserveLauncher = options?.reserveLauncherSpace !== false;
  const launcherOffset = reserveLauncher ? launcherSize + APP_CHAT_WIDGET_LAUNCHER_GAP : 0;
  const chatWindowBottomOffset =
    launcherOffset + widgetBottomSpace + Math.max(insets.bottom, 12);
  const reservedTop = insets.top + 16;
  const panelHeight = Math.max(320, height - reservedTop - chatWindowBottomOffset);

  return {
    width,
    height,
    isNativeMobile: isNative,
    isMobileLayout,
    isNarrow,
    panelWidth,
    panelHeight,
    horizontalMargin,
    horizontalInset: horizontalMargin,
    launcherSize,
    chatWindowBottomOffset,
  };
}

export function useAppChatWidgetLayout(
  insets?: Pick<EdgeInsets, 'top' | 'bottom' | 'left' | 'right'>,
  customization?: Pick<
    ChatWidgetCustomization,
    'customWidthEnabled' | 'widgetWidth' | 'widgetBottomSpace' | 'avatarSize'
  >,
  options?: { reserveLauncherSpace?: boolean },
) {
  const width = useLayoutViewportWidth();
  const { height } = useWindowDimensions();
  const safeInsets = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const launcherSize = getAppChatWidgetLauncherSize(customization?.avatarSize ?? 38);

  return getAppChatWidgetPanelMetrics(width, height, safeInsets, {
    customWidth: {
      enabled: Boolean(customization?.customWidthEnabled),
      width: customization?.widgetWidth ?? APP_CHAT_WIDGET_PANEL_WIDTH,
    },
    widgetBottomSpace: customization?.widgetBottomSpace ?? 0,
    launcherSize,
    reserveLauncherSpace: options?.reserveLauncherSpace,
  });
}
