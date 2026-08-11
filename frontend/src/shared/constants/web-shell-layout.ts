/** Fixed web app footer bar height (`_layout.tsx` `webFooter.minHeight`). */
export const WEB_APP_FOOTER_HEIGHT = 52;

/** Bottom inset for scroll content sitting above the fixed web footer. */
export function getWebFooterScrollPadding(baseSpacing = 16, extra = 0): number {
  return WEB_APP_FOOTER_HEIGHT + baseSpacing + extra;
}
