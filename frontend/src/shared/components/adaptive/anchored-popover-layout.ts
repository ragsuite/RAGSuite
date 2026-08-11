export type PopoverAnchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ResolveAnchoredPopoverLayoutInput = {
  anchor: PopoverAnchor;
  windowWidth: number;
  windowHeight: number;
  popoverWidth: number;
  preferredMaxHeight?: number;
  edgePadding?: number;
  gap?: number;
  minHeight?: number;
};

export type AnchoredPopoverLayout = {
  menuLeft: number;
  /** Set when the menu opens below the anchor. */
  menuTop?: number;
  /** Set when the menu opens above the anchor (bottom edge flush with anchor top). */
  menuBottom?: number;
  menuMaxHeight: number;
  openBelow: boolean;
};

/** Pick above/below placement and clamp menu height to the available viewport slice. */
export function resolveAnchoredPopoverLayout({
  anchor,
  windowWidth,
  windowHeight,
  popoverWidth,
  preferredMaxHeight = 280,
  edgePadding = 12,
  gap = 4,
  minHeight = 120,
}: ResolveAnchoredPopoverLayoutInput): AnchoredPopoverLayout {
  const menuLeft = Math.max(
    edgePadding,
    Math.min(anchor.left, windowWidth - popoverWidth - edgePadding),
  );

  const spaceBelow = windowHeight - (anchor.top + anchor.height) - edgePadding;
  const spaceAbove = anchor.top - edgePadding;
  const openBelow = spaceBelow >= spaceAbove;
  const available = Math.max(minHeight, (openBelow ? spaceBelow : spaceAbove) - gap);
  const menuMaxHeight = Math.min(preferredMaxHeight, available);

  if (openBelow) {
    return {
      menuLeft,
      menuTop: anchor.top + anchor.height + gap,
      menuMaxHeight,
      openBelow,
    };
  }

  return {
    menuLeft,
    menuBottom: windowHeight - anchor.top + gap,
    menuMaxHeight,
    openBelow,
  };
}
