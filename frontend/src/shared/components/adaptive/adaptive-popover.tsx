import React, { createContext, useContext } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveAnchoredPopoverLayout, type PopoverAnchor } from '@/shared/components/adaptive/anchored-popover-layout';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useTranslation } from '@/i18n';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getWebViewportSize } from '@/shared/utils/measure-popover-anchor';

export type { PopoverAnchor };

type PopoverLayoutContextValue = {
  maxHeight: number;
};

const PopoverLayoutContext = createContext<PopoverLayoutContextValue | null>(null);

/** Max scroll height for picker lists rendered inside an anchored popover. */
export function usePopoverLayout(): PopoverLayoutContextValue | null {
  return useContext(PopoverLayoutContext);
}

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  anchor?: PopoverAnchor | null;
  /** Width of anchored popover; defaults to overlay token. */
  popoverWidth?: number;
  /** When true, use popoverWidth exactly (do not expand to anchor width). */
  lockWidth?: boolean;
  /** Preferred menu height before clamping to viewport space above/below the anchor. */
  maxHeight?: number;
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Anchored popover on wide web; bottom sheet via AdaptiveOverlay on compact layouts.
 * Flips above the anchor when there is more room on top than below.
 */
export function AdaptivePopover({
  visible,
  onClose,
  children,
  anchor,
  popoverWidth = overlayTokens.width.popover,
  lockWidth = false,
  maxHeight = 280,
  title,
  contentStyle,
  accessibilityLabel,
}: Props) {
  const { colors, spacing, surfaceRadius, elevation } = useAppTheme();
  const { t } = useTranslation();
  const isCompact = useCompactLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const viewport =
    Platform.OS === 'web'
      ? getWebViewportSize()
      : { width: windowWidth, height: windowHeight };
  const resolvedViewportWidth = viewport.width > 0 ? viewport.width : windowWidth;
  const resolvedViewportHeight = viewport.height > 0 ? viewport.height : windowHeight;

  if (!visible) return null;

  if (isCompact || !anchor) {
    return (
      <AdaptiveOverlay
        visible={visible}
        title={title ?? t('common.actions')}
        onClose={onClose}
        scrollable={false}
        accessibilityLabel={accessibilityLabel}>
        <View style={contentStyle}>{children}</View>
      </AdaptiveOverlay>
    );
  }

  const resolvedWidth = lockWidth ? popoverWidth : Math.max(popoverWidth, anchor.width);
  const layout = resolveAnchoredPopoverLayout({
    anchor,
    windowWidth: resolvedViewportWidth,
    windowHeight: resolvedViewportHeight,
    popoverWidth: resolvedWidth,
    preferredMaxHeight: maxHeight,
    edgePadding: spacing.sm,
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.a11y.dismissMenu')}
        style={styles.backdrop}
        onPress={onClose}
      />
      <PopoverLayoutContext.Provider value={{ maxHeight: layout.menuMaxHeight }}>
        <View
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.popover,
            elevation.raised,
            contentStyle,
            {
              left: layout.menuLeft,
              width: resolvedWidth,
              maxHeight: layout.menuMaxHeight,
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surface,
              ...(layout.openBelow
                ? { top: layout.menuTop }
                : { bottom: layout.menuBottom }),
            },
          ]}>
          {children}
        </View>
      </PopoverLayoutContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
