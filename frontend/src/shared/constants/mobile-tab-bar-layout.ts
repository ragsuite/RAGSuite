/** Mirrors `AppBottomTabBar` positioning so overlays can sit flush above the pill tab bar. */
export const MOBILE_TAB_BAR_MIN_HEIGHT = 60;
export const MOBILE_TAB_BAR_PADDING_VERTICAL = 7;
/** Extra breathing room above the home indicator inside the bottom safe area. */
export const MOBILE_TAB_BAR_FLOAT_MARGIN = 8;

/** Padding below the pill so the bar clears the home indicator (full-bleed shell). */
export function getMobileTabBarBottomPadding(safeAreaBottom: number): number {
  return safeAreaBottom + MOBILE_TAB_BAR_FLOAT_MARGIN;
}

/** @deprecated Use `getMobileTabBarBottomPadding` — kept for call sites migrating from offset positioning. */
export function getMobileTabBarBottomOffset(safeAreaBottom: number): number {
  return getMobileTabBarBottomPadding(safeAreaBottom);
}

export function getMobileTabBarStackHeight(safeAreaBottom: number): number {
  return (
    getMobileTabBarBottomPadding(safeAreaBottom) +
    MOBILE_TAB_BAR_MIN_HEIGHT +
    MOBILE_TAB_BAR_PADDING_VERTICAL * 2
  );
}
