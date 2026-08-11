import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';

import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useTranslation } from '@/i18n';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel width on wide layouts. Full width below `fullWidthBelow`. */
  width?: number;
  /** Below this viewport width the panel is full-bleed. Default 768. */
  fullWidthBelow?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const EASE_IN_OUT = Easing.inOut(Easing.ease);

/**
 * Right-side sheet shell matching reference web `Sheet`:
 * - Overlay: fixed inset-0, black/80, z-index 100000
 * - Panel: right-anchored, full height, z-index 100001
 * - Open: slide-in-from-right 500ms ease-in-out + fade
 * - Close: slide-out-to-right 300ms ease-in-out + fade
 */
export function SidePanelOverlay({
  visible,
  onClose,
  children,
  width = overlayTokens.width.sideSheetLg,
  fullWidthBelow = 768,
  style,
  accessibilityLabel,
}: Props) {
  const { colors, elevation } = useAppTheme();
  const { t } = useTranslation();
  const { width: viewportWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);

  const isFullWidth = viewportWidth < fullWidthBelow;
  const panelWidth = isFullWidth ? viewportWidth : Math.min(width, viewportWidth);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: reducedMotion ? 0 : overlayTokens.motion.sideSheetEnter,
        easing: EASE_IN_OUT,
      });
      return;
    }

    if (!mounted) return;

    progress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : overlayTokens.motion.sideSheetExit,
        easing: EASE_IN_OUT,
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, mounted, progress, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * panelWidth }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal>
      <View
        style={[
          styles.root,
          Platform.OS === 'web' ? { zIndex: overlayTokens.zIndex.overlay } : null,
        ]}
        pointerEvents="box-none">
        <Animated.View
          style={[styles.backdrop, { backgroundColor: overlayTokens.backdrop }, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.a11y.dismissDialog')}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          accessibilityLabel={accessibilityLabel}
          importantForAccessibility="yes"
          style={[
            styles.panel,
            elevation.raised,
            {
              width: panelWidth,
              maxWidth: panelWidth,
              backgroundColor: colors.surface,
              borderLeftColor: colors.border,
              borderLeftWidth: StyleSheet.hairlineWidth,
              ...(Platform.OS === 'web' ? { zIndex: overlayTokens.zIndex.content } : {}),
            },
            panelStyle,
            style,
          ]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    height: '100%',
    maxHeight: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
      } as object,
      default: {},
    }),
  },
});
