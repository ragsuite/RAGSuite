import { Platform } from 'react-native';

/** Below this width, web uses compact (mobile-style) overlays and pickers. */
export const COMPACT_LAYOUT_BREAKPOINT = 900;

/** Minimum touch target (WCAG / iOS HIG). */
export const TOUCH_TARGET_MIN = 44;

/** Shared height for toolbar search fields and inline filter selects. */
export const TOOLBAR_CONTROL_HEIGHT = 44;

/** App chrome header controls — intentionally smaller than toolbar rows. */
export const APP_CHROME_CONTROL_HEIGHT = 40;

/** Config module settings/training sidebar width (Chat & Search). */
export const CONFIG_SIDEBAR_WIDTH = 220;

/** Web app drawer width — keep in sync with `app/(app)/_layout.tsx` drawerStyle. */
export const WEB_DRAWER_WIDTH_EXPANDED = 292;
export const WEB_DRAWER_WIDTH_COLLAPSED = 64;

/** Minimum content width when subtracting the permanent web drawer. */
export const WEB_CONTENT_MIN_WIDTH = 320;

/** Content width needed for config module inner nav + main panel on web. */
export const CONFIG_MODULE_SIDEBAR_BREAKPOINT = COMPACT_LAYOUT_BREAKPOINT + CONFIG_SIDEBAR_WIDTH;

/** Brand layout — `brandTokens.layout.contentMax`. */
export const CONTENT_MAX_WIDTH = 1200;

/** Shared breakpoints for feature page content width (web). */
export const FEATURE_CONTENT_BREAKPOINT_XL = 1500;
export const FEATURE_CONTENT_BREAKPOINT_LG = 1200;
export const FEATURE_CONTENT_BREAKPOINT_MD = 900;
export const FEATURE_CONTENT_BREAKPOINT_SM = 480;

/** Canonical max content widths aligned across Analytics, Crawl, Configuration, etc. */
export const FEATURE_CONTENT_MAX_WIDTH = {
  xl: 1360,
  lg: 1160,
  md: 980,
  sm: 760,
} as const;

/** Responsive max width for centered feature page content on web. */
export function getFeatureContentMaxWidth(width: number): number {
  if (width >= FEATURE_CONTENT_BREAKPOINT_XL) return FEATURE_CONTENT_MAX_WIDTH.xl;
  if (width >= FEATURE_CONTENT_BREAKPOINT_LG) return FEATURE_CONTENT_MAX_WIDTH.lg;
  if (width >= FEATURE_CONTENT_BREAKPOINT_MD) return FEATURE_CONTENT_MAX_WIDTH.md;
  return Math.min(FEATURE_CONTENT_MAX_WIDTH.sm, Math.max(320, width - 24));
}

/** Responsive horizontal inset for centered feature page content on web. */
export function getFeatureHorizontalPadding(width: number): number {
  if (width < FEATURE_CONTENT_BREAKPOINT_SM) return 12;
  if (width < FEATURE_CONTENT_BREAKPOINT_MD) return 16;
  return 20;
}

export function getWebDrawerWidth(collapsed: boolean): number {
  return collapsed ? WEB_DRAWER_WIDTH_COLLAPSED : WEB_DRAWER_WIDTH_EXPANDED;
}

/** Main content width on web after the permanent drawer (not inner config nav). */
export function getWebContentViewportWidth(viewportWidth: number, sidebarCollapsed = false): number {
  const drawerWidth = getWebDrawerWidth(sidebarCollapsed);
  return Math.max(WEB_CONTENT_MIN_WIDTH, viewportWidth - drawerWidth);
}

/** Extra inset above the home-indicator / tab bar on native. */
export const BOTTOM_TAB_INSET = Platform.select({ ios: 50, android: 80 }) ?? 0;
