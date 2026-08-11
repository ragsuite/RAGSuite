import type { TextStyle, ViewStyle } from 'react-native';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import type { SurfaceRadius } from '@/theme/resolve-surface-radius';

type TabColors = {
  surface: string;
  surfaceMuted: string;
  surfaceHover?: string;
  border: string;
  text: string;
  textOnPrimary: string;
  primary: string;
};

type ColorMode = 'light' | 'dark';

type TabChromeInput = {
  active: boolean;
  pressed: boolean;
  /** Web pointer hover — treated like pressed for inactive tabs. */
  hovered?: boolean;
  colors: TabColors;
  surfaceRadius: SurfaceRadius;
  brandRadius: number;
  useWebParity: boolean;
  /** App theme mode — light tabs use primary active (reference); dark uses neutral active. */
  colorMode?: ColorMode;
};

export type TabChromeStyle = {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  borderRadius: number;
};

export const WEB_PARITY_TAB_HEIGHT_PRIMARY = TOUCH_TARGET_MIN;
export const WEB_PARITY_TAB_HEIGHT_SECONDARY = 36;
export const WEB_PARITY_NAV_ITEM_HEIGHT = 40;

type TypographyBody = {
  fontSize?: number;
  lineHeight?: number;
};

/** Fixed outer box for filled + outline tabs (border always counts toward height). */
export function getWebParityTabPressableStyle(chrome: TabChromeStyle, height: number): ViewStyle {
  return {
    height,
    minHeight: height,
    borderRadius: chrome.borderRadius,
    borderColor: chrome.borderColor,
    borderWidth: chrome.borderWidth,
    backgroundColor: chrome.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
  };
}

/** Same font weight for active/inactive — avoids 1px label metric shift. */
export function getWebParityTabLabelStyle(
  textColor: string,
  typography: TypographyBody,
  options?: { fontSize?: number },
): TextStyle {
  return {
    color: textColor,
    fontSize: options?.fontSize ?? typography.fontSize,
    lineHeight: typography.lineHeight,
  };
}

export function getWebParityNavPressableStyle(chrome: TabChromeStyle, height = WEB_PARITY_NAV_ITEM_HEIGHT): ViewStyle {
  return {
    ...getWebParityTabPressableStyle(chrome, height),
    flexDirection: 'row',
  };
}

function isDarkMode(colorMode?: ColorMode) {
  return colorMode === 'dark';
}

/** Reference web tabs: light = primary active; dark = surfaceMuted active; outline pills on wide web. */
export function getWebParityTabStyle({
  active,
  pressed,
  hovered = false,
  colors,
  surfaceRadius,
  brandRadius,
  useWebParity,
  colorMode = 'light',
}: TabChromeInput): TabChromeStyle {
  if (useWebParity) {
    const dark = isDarkMode(colorMode);

    if (active) {
      if (dark) {
        return {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.border,
          borderWidth: 1,
          textColor: colors.text,
          borderRadius: surfaceRadius.button,
        };
      }
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        borderWidth: 1,
        textColor: colors.textOnPrimary,
        borderRadius: surfaceRadius.button,
      };
    }

    if (pressed || hovered) {
      return {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderWidth: 1,
        textColor: colors.text,
        borderRadius: surfaceRadius.button,
      };
    }

    return {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      textColor: colors.text,
      borderRadius: surfaceRadius.button,
    };
  }

  return {
    backgroundColor: active ? colors.primary : pressed || hovered ? colors.surfaceMuted : colors.surface,
    borderColor: active ? colors.primary : colors.border,
    borderWidth: 1,
    textColor: active ? colors.textOnPrimary : colors.text,
    borderRadius: surfaceRadius.button,
  };
}

/** Sidebar sub-nav active state — ghost button with muted fill (maps to reference sidebar-accent). */
export function getWebParityNavItemStyle({
  active,
  pressed,
  hovered = false,
  colors,
  surfaceRadius,
  brandRadius,
  useWebParity,
}: TabChromeInput): TabChromeStyle {
  if (useWebParity) {
    return {
      backgroundColor: active
        ? colors.surfaceMuted
        : pressed
          ? colors.surfaceMuted
          : hovered
            ? (colors.surfaceHover ?? colors.surface)
            : 'transparent',
      borderColor: active ? colors.border : 'transparent',
      borderWidth: 1,
      textColor: colors.text,
      borderRadius: surfaceRadius.button,
    };
  }

  return {
    backgroundColor: active ? colors.primary : pressed || hovered ? colors.surfaceMuted : 'transparent',
    borderColor: active ? colors.primary : 'transparent',
    borderWidth: active ? 0 : 0,
    textColor: active ? colors.textOnPrimary : colors.text,
    borderRadius: surfaceRadius.button,
  };
}

export function getPanelSurfaceRadius(_isWebParity: boolean, surfaceRadius: SurfaceRadius, _brandMd: number): number {
  return surfaceRadius.card;
}

export function getControlSurfaceRadius(surfaceRadius: SurfaceRadius): number {
  return surfaceRadius.button;
}
