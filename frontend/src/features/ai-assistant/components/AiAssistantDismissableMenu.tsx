import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Platform, Pressable, StyleSheet, View, type View as RNView } from 'react-native';

import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type AnchorRect = { top: number; left: number; width: number; height: number };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Accessibility label for the full-screen dismiss layer. */
  dismissLabel: string;
  children: React.ReactNode;
  /** Align the menu card under the trigger (default: right). */
  align?: 'left' | 'right';
  /** Trigger view used to position the portaled / modal menu. */
  anchorRef?: React.RefObject<RNView | null>;
};

const MENU_MIN_WIDTH = 160;
const MENU_GAP = 6;
const MENU_Z = overlayTokens.zIndex.overlay;

function measureAnchor(ref: React.RefObject<RNView | null> | undefined): Promise<AnchorRect | null> {
  return new Promise((resolve) => {
    const node = ref?.current as
      | (RNView & {
          measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
        })
      | null;
    if (!node?.measureInWindow) {
      resolve(null);
      return;
    }
    node.measureInWindow((left, top, width, height) => {
      if (width <= 0 && height <= 0) {
        resolve(null);
        return;
      }
      resolve({ top, left, width, height });
    });
  });
}

/**
 * Portaled (web) / Modal (native) menu so options stack above ScrollView content
 * and outside clicks dismiss reliably.
 */
export function AiAssistantDismissableMenu({
  open,
  onClose,
  dismissLabel,
  children,
  align = 'right',
  anchorRef,
}: Props) {
  const { colors, spacing, radius } = useAppTheme();
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  /** True after measure finishes (or immediately when no anchorRef). Prevents wrong-position flash. */
  const [positionReady, setPositionReady] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      setPositionReady(false);
      return;
    }
    if (!anchorRef) {
      setAnchor(null);
      setPositionReady(true);
      return;
    }
    let cancelled = false;
    setPositionReady(false);
    void measureAnchor(anchorRef).then((rect) => {
      if (cancelled) return;
      setAnchor(rect);
      setPositionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const menuCardStyle = [
    styles.menuCard,
    {
      borderRadius: radius.md,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: spacing.xs,
      minWidth: MENU_MIN_WIDTH,
    },
  ];

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const top = anchor ? anchor.top + anchor.height + MENU_GAP : 48;
    const left = anchor
      ? align === 'left'
        ? anchor.left
        : Math.max(8, anchor.left + anchor.width - MENU_MIN_WIDTH)
      : Math.max(8, viewportWidth - MENU_MIN_WIDTH - 24);

    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: MENU_Z }}>
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onClose}
          style={{
            position: 'absolute',
            inset: 0,
            border: 0,
            padding: 0,
            margin: 0,
            background: 'transparent',
            cursor: 'default',
          }}
        />
        {positionReady ? (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top,
              left,
              minWidth: MENU_MIN_WIDTH,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              background: colors.surface,
              paddingTop: spacing.xs,
              paddingBottom: spacing.xs,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              zIndex: 1,
            }}
          >
            {children}
          </div>
        ) : null}
      </div>,
      document.body,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.nativeRoot}>
        <Pressable
          accessibilityLabel={dismissLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        />
        {positionReady ? (
          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                justifyContent: 'flex-start',
                alignItems: align === 'left' ? 'flex-start' : 'flex-end',
                paddingTop: anchor ? anchor.top + anchor.height + MENU_GAP : 72,
                paddingHorizontal: spacing.md,
              },
            ]}
          >
            <View accessibilityRole="menu" style={menuCardStyle}>
              {children}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  nativeRoot: {
    flex: 1,
  },
});
