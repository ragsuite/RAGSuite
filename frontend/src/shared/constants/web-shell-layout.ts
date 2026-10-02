/** Fixed web app footer bar height (`_layout.tsx` `webFooter.minHeight`). */
export const WEB_APP_FOOTER_HEIGHT = 52;

/**
 * Bottom inset for scroll `contentContainerStyle` on web.
 * The Drawer scene already reserves `WEB_APP_FOOTER_HEIGHT` when the system footer
 * is shown — do not add that height again here (it creates a visible empty gap).
 */
export function getWebFooterScrollPadding(baseSpacing = 16, extra = 0): number {
  return baseSpacing + extra;
}
