import React, { createContext, useContext, useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
  /**
   * When false on wide web, render a floating menu without a full-screen Modal/backdrop
   * so the page stays scrollable. Default true keeps Modal dismiss for action menus.
   */
  blocking?: boolean;
};

function FloatingWebShell({
  id,
  style,
  accessibilityLabel,
  children,
}: {
  id: string;
  style: CSSProperties;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label={accessibilityLabel}
      style={style}>
      {children}
    </div>
  );
}

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
  blocking = true,
}: Props) {
  const { colors, spacing, surfaceRadius, elevation } = useAppTheme();
  const { t } = useTranslation();
  const isCompact = useCompactLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const instanceId = useId().replace(/:/g, '');
  const floatingDomId = `ragsuite-floating-popover-${instanceId}`;
  const viewport =
    Platform.OS === 'web'
      ? getWebViewportSize()
      : { width: windowWidth, height: windowHeight };
  const resolvedViewportWidth = viewport.width > 0 ? viewport.width : windowWidth;
  const resolvedViewportHeight = viewport.height > 0 ? viewport.height : windowHeight;
  const useFloatingWeb = Platform.OS === 'web' && !blocking && Boolean(anchor) && !isCompact;

  useEffect(() => {
    if (!visible || !useFloatingWeb || typeof document === 'undefined') return;

    const handlePointerDown = (event: Event) => {
      const root = document.getElementById(floatingDomId);
      const target = event.target;
      if (root && target instanceof Node && root.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleViewportChange = () => {
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [visible, useFloatingWeb, floatingDomId, onClose]);

  if (!visible) return null;

  // Non-blocking selects must not fall back to a sheet overlay when anchor is missing.
  if (!blocking && !anchor && !isCompact) {
    return null;
  }

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

  if (useFloatingWeb && typeof document !== 'undefined') {
    const raisedShadow =
      elevation.raised && 'boxShadow' in elevation.raised
        ? (elevation.raised.boxShadow as string)
        : '0 10px 30px rgba(27, 26, 23, 0.06)';

    const shellStyle: CSSProperties = {
      position: 'fixed',
      left: layout.menuLeft,
      width: resolvedWidth,
      maxHeight: layout.menuMaxHeight,
      zIndex: overlayTokens.zIndex.content,
      boxSizing: 'border-box',
      border: `1px solid ${colors.border}`,
      borderRadius: surfaceRadius.card,
      backgroundColor: colors.surface,
      boxShadow: raisedShadow,
      overflow: 'hidden',
      ...(layout.openBelow
        ? { top: layout.menuTop }
        : { bottom: layout.menuBottom }),
    };

    return createPortal(
      <FloatingWebShell
        id={floatingDomId}
        style={shellStyle}
        accessibilityLabel={accessibilityLabel}>
        <PopoverLayoutContext.Provider value={{ maxHeight: layout.menuMaxHeight }}>
          <View style={[{ maxHeight: layout.menuMaxHeight }, contentStyle]}>{children}</View>
        </PopoverLayoutContext.Provider>
      </FloatingWebShell>,
      document.body,
    );
  }

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
