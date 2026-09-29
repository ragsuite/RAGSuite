import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';

import { AdaptivePopover } from '@/shared/components/adaptive/adaptive-popover';
import { usePopoverAnchor } from '@/shared/hooks/use-popover-anchor';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const DEFAULT_POPOVER_WIDTH = 300;
const HOVER_CLOSE_DELAY_MS = 120;

type Props = {
  title: string;
  body: string;
  accessibilityLabel: string;
  iconSize?: number;
  popoverWidth?: number;
};

/** (i) button that shows a short explanation: opens on hover (web) and pins open on click. */
export function InfoHintButton({
  title,
  body,
  accessibilityLabel,
  iconSize = 18,
  popoverWidth = DEFAULT_POPOVER_WIDTH,
}: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { anchorRef, open, anchor, openMenu, close } = usePopoverAnchor();
  const pinnedByClickRef = useRef(false);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current != null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  const dismiss = useCallback(() => {
    clearHoverCloseTimer();
    pinnedByClickRef.current = false;
    close();
  }, [clearHoverCloseTimer, close]);

  const onPress = useCallback(() => {
    clearHoverCloseTimer();
    if (open && pinnedByClickRef.current) {
      dismiss();
      return;
    }
    pinnedByClickRef.current = true;
    if (!open) openMenu();
  }, [clearHoverCloseTimer, dismiss, open, openMenu]);

  const onHoverIn = useCallback(() => {
    if (Platform.OS !== 'web') return;
    clearHoverCloseTimer();
    if (!open) openMenu();
  }, [clearHoverCloseTimer, open, openMenu]);

  const onHoverOut = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (pinnedByClickRef.current) return;
    clearHoverCloseTimer();
    // Delay so the pointer can move from the icon into the floating tooltip without dismissing.
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      if (!pinnedByClickRef.current) close();
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearHoverCloseTimer, close]);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={onPress}
          onHoverIn={onHoverIn}
          onHoverOut={onHoverOut}
          style={({ pressed }) => [
            styles.button,
            {
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed || open ? colors.surfaceMuted : 'transparent',
            },
          ]}>
          <Info size={iconSize} color={colors.primary} />
        </Pressable>
      </View>

      <AdaptivePopover
        visible={open}
        onClose={dismiss}
        anchor={anchor}
        title={title}
        accessibilityLabel={accessibilityLabel}
        popoverWidth={popoverWidth}
        lockWidth
        maxHeight={240}
        blocking={false}
        contentStyle={{ padding: spacing.sm }}>
        <Pressable onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
          <Text style={[typography.caption, styles.body, { color: colors.textMuted }]}>{body}</Text>
        </Pressable>
      </AdaptivePopover>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { lineHeight: 20 },
});
