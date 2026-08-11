import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import Animated, {
  Easing,
  ZoomIn,
  ZoomOut,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { X, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import {
  isSideSheetSize,
  overlayTokens,
  resolveOverlayWidth,
  type OverlaySize,
} from '@/shared/constants/overlay-tokens';
import { useTranslation } from '@/i18n';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

type Presentation = 'auto' | 'sideSheet' | 'dialog';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  scrollEnabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Applied to the scroll view (e.g. maxHeight for pickers). */
  scrollStyle?: StyleProp<ViewStyle>;
  /**
   * When true with edge padding, the body wrapper has no horizontal pad so nested
   * scrollers can sit flush (put padding on content / non-scroll siblings instead).
   */
  flushBody?: boolean;
  accessibilityLabel?: string;
  titleIcon?: LucideIcon;
  /** Token-based width; overridden by explicit `maxWidth`. */
  size?: OverlaySize | number;
  maxWidth?: number;
  /**
   * `auto` — side sheet when size is a sideSheet* token (wide web); bottom sheet on compact; dialog otherwise.
   * `sideSheet` — force right sheet on wide web.
   * `dialog` — force centered modal on wide web; on compact still uses bottom-sheet motion.
   */
  presentation?: Presentation;
  showCloseButton?: boolean;
  /** Top border above footer — standard for confirm dialogs. */
  footerBordered?: boolean;
};

const SHEET_EASE = Easing.inOut(Easing.ease);

export function AdaptiveOverlay({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scrollable = true,
  scrollEnabled = true,
  contentStyle,
  scrollStyle,
  flushBody = false,
  accessibilityLabel,
  titleIcon: TitleIcon,
  size = 'default',
  maxWidth,
  presentation = 'auto',
  showCloseButton = true,
  footerBordered = false,
}: Props) {
  const { colors, spacing, surfaceRadius, typography, elevation } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const isCompact = useCompactLayout();
  const { height: windowHeight } = useWindowDimensions();
  const resolvedWidth = resolveOverlayWidth(size, maxWidth);

  const sizeIsSideSheet = isSideSheetSize(size);
  const wantsSideSheet =
    presentation === 'sideSheet' || (presentation === 'auto' && sizeIsSideSheet);
  const isSideSheet = wantsSideSheet && Platform.OS === 'web' && !isCompact;
  /** All compact overlays share one bottom-sheet transition (Search, Create Project, pickers, confirms). */
  const isBottomSheet = isCompact;

  const panelWidth = resolvedWidth;
  const modalR = surfaceRadius.modal;
  const sheetTopRadius = overlayTokens.bottomSheetTopRadius;
  const sheetTravel = Math.max(320, Math.round(windowHeight * 0.92));

  const [sideMounted, setSideMounted] = useState(false);
  const sideProgress = useSharedValue(0);
  const [sheetMounted, setSheetMounted] = useState(false);
  const sheetProgress = useSharedValue(0);

  useEffect(() => {
    if (!isSideSheet) {
      setSideMounted(false);
      sideProgress.value = 0;
      return;
    }

    if (visible) {
      setSideMounted(true);
      sideProgress.value = withTiming(1, {
        duration: reducedMotion ? 0 : overlayTokens.motion.sideSheetEnter,
        easing: SHEET_EASE,
      });
      return;
    }

    if (!sideMounted) return;

    sideProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : overlayTokens.motion.sideSheetExit,
        easing: SHEET_EASE,
      },
      (finished) => {
        if (finished) runOnJS(setSideMounted)(false);
      },
    );
  }, [visible, isSideSheet, sideMounted, sideProgress, reducedMotion]);

  useEffect(() => {
    if (!isBottomSheet) {
      setSheetMounted(false);
      sheetProgress.value = 0;
      return;
    }

    if (visible) {
      setSheetMounted(true);
      sheetProgress.value = withTiming(1, {
        duration: reducedMotion ? 0 : overlayTokens.motion.bottomSheetEnter,
        easing: SHEET_EASE,
      });
      return;
    }

    if (!sheetMounted) return;

    sheetProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : overlayTokens.motion.bottomSheetExit,
        easing: SHEET_EASE,
      },
      (finished) => {
        if (finished) runOnJS(setSheetMounted)(false);
      },
    );
  }, [visible, isBottomSheet, sheetMounted, sheetProgress, reducedMotion]);

  const sideBackdropStyle = useAnimatedStyle(() => ({
    opacity: sideProgress.value,
  }));

  const sidePanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - sideProgress.value) * panelWidth }],
  }));

  const sheetBackdropStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value,
  }));

  const sheetPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.value) * sheetTravel }],
  }));

  /** Edge padding on header/body/footer so overlay scrollbars sit flush (mobile + side sheets). */
  const edgePad = isSideSheet || isCompact;
  const bodyEdgePad = edgePad && !flushBody;

  const body = scrollable ? (
    <AppScrollView
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      automaticallyAdjustKeyboardInsets={false}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      bounces={scrollEnabled}
      scrollbarVariant={edgePad ? 'overlay' : 'screen'}
      style={[
        isBottomSheet ? styles.sheetScrollBody : undefined,
        isSideSheet ? styles.edgeScroll : undefined,
        scrollStyle,
      ]}
      contentContainerStyle={[
        styles.scrollBody,
        edgePad ? { paddingHorizontal: spacing.md } : null,
        contentStyle,
      ]}>
      {children}
    </AppScrollView>
  ) : (
    <View
      style={[
        isBottomSheet ? styles.sheetStaticBody : undefined,
        bodyEdgePad ? { paddingHorizontal: spacing.md, flexGrow: isSideSheet ? 1 : undefined } : null,
        isSideSheet ? { flex: 1 } : null,
        contentStyle,
      ]}>
      {children}
    </View>
  );

  const header = (
    <View style={[styles.header, edgePad ? { paddingHorizontal: spacing.md } : null]}>
      <View style={[styles.headerCopy, { gap: 4 }]}>
        <View style={styles.titleRow}>
          {TitleIcon ? <TitleIcon size={20} color={colors.primary} /> : null}
          <Text accessibilityRole="header" style={[typography.subtitle, styles.title, { color: colors.text, flex: 1 }]}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>{subtitle}</Text> : null}
      </View>
      {showCloseButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.a11y.closeDialog')}
          hitSlop={12}
          onPress={onClose}
          style={({ pressed, hovered }) => [
            styles.close,
            {
              minWidth: TOUCH_TARGET_MIN,
              minHeight: TOUCH_TARGET_MIN,
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed || hovered ? colors.surfaceMuted : 'transparent',
            },
          ]}>
          <X size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  const footerNode = footer ? (
    <View
      style={[
        { gap: spacing.xs, paddingTop: footerBordered ? spacing.sm : 0 },
        footerBordered ? { borderTopWidth: 1, borderTopColor: colors.border } : null,
        isBottomSheet ? styles.sheetFooter : null,
        edgePad ? { paddingHorizontal: spacing.md } : null,
      ]}>
      {footer}
    </View>
  ) : null;

  // —— Side sheet (reference web Sheet) ——
  if (isSideSheet) {
    if (!sideMounted) return null;

    return (
      <Modal
        visible={sideMounted}
        transparent
        animationType="none"
        onRequestClose={onClose}
        accessibilityViewIsModal>
        <View
          style={[
            styles.sideRoot,
            Platform.OS === 'web' ? { zIndex: overlayTokens.zIndex.overlay } : null,
          ]}>
          <Animated.View
            style={[styles.backdrop, { backgroundColor: overlayTokens.backdrop }, sideBackdropStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.a11y.dismissDialog')}
              style={StyleSheet.absoluteFill}
              onPress={onClose}
            />
          </Animated.View>
          <Animated.View
            accessibilityLabel={accessibilityLabel ?? title}
            importantForAccessibility="yes"
            style={[
              styles.panel,
              styles.panelSideSheet,
              elevation.raised,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                width: panelWidth,
                maxWidth: panelWidth,
                paddingTop: spacing.md,
                paddingBottom: spacing.md,
                gap: spacing.sm,
                ...(Platform.OS === 'web' ? { zIndex: overlayTokens.zIndex.content } : {}),
              },
              sidePanelStyle,
            ]}>
            {header}
            {body}
            {footerNode}
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // —— Compact bottom sheet (Search, Create Project, pickers, confirms, …) ——
  if (isBottomSheet) {
    if (!sheetMounted) return null;

    return (
      <Modal
        visible={sheetMounted}
        transparent
        animationType="none"
        onRequestClose={onClose}
        accessibilityViewIsModal>
        <View style={styles.sheetRoot}>
          <Animated.View
            style={[styles.backdrop, { backgroundColor: overlayTokens.backdrop }, sheetBackdropStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.a11y.dismissDialog')}
              style={StyleSheet.absoluteFill}
              onPress={onClose}
            />
          </Animated.View>
          <AppKeyboardAvoiding surface="modal" style={styles.sheetKeyboard} pointerEvents="box-none">
            <Animated.View
              accessibilityLabel={accessibilityLabel ?? title}
              importantForAccessibility="yes"
              style={[
                styles.panel,
                styles.panelSheet,
                styles.panelSheetShrink,
                isBottomSheet && footer ? styles.panelSheetWithFooter : null,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  // Full-bleed on compact — ignore dialog/popover maxWidth (avoids floating card).
                  maxWidth: '100%',
                  width: '100%',
                  paddingTop: spacing.xs,
                  paddingHorizontal: 0,
                  paddingBottom: Math.max(insets.bottom, spacing.md),
                  gap: spacing.sm,
                  borderTopLeftRadius: sheetTopRadius,
                  borderTopRightRadius: sheetTopRadius,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  borderLeftWidth: 0,
                  borderRightWidth: 0,
                  borderBottomWidth: 0,
                },
                sheetPanelStyle,
              ]}>
              <View
                style={[styles.handle, { backgroundColor: colors.border, borderRadius: surfaceRadius.button }]}
                accessibilityElementsHidden
              />
              {header}
              {body}
              {footerNode}
            </Animated.View>
          </AppKeyboardAvoiding>
        </View>
      </Modal>
    );
  }

  // —— Wide-web centered dialog ——
  if (!visible) return null;

  const panelEntering = reducedMotion
    ? FadeIn.duration(0)
    : ZoomIn.duration(motion.modalEnter).springify().damping(18).stiffness(220);
  const panelExiting = reducedMotion ? undefined : ZoomOut.duration(motion.modalEnter);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      <AppKeyboardAvoiding
        surface="modal"
        style={[styles.overlay, { backgroundColor: overlayTokens.backdrop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.a11y.dismissDialog')}
          style={styles.backdrop}
          onPress={onClose}
        />
        <Animated.View
          entering={panelEntering}
          exiting={panelExiting}
          accessibilityLabel={accessibilityLabel ?? title}
          importantForAccessibility="yes"
          style={[
            styles.panel,
            styles.panelDialog,
            elevation.raised,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: modalR,
              maxWidth: panelWidth,
              width: '100%',
              paddingTop: spacing.md,
              paddingHorizontal: spacing.md,
              paddingBottom: spacing.md,
              gap: spacing.sm,
            },
          ]}>
          {header}
          {body}
          {footerNode}
        </Animated.View>
      </AppKeyboardAvoiding>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetKeyboard: {
    flex: 1,
    width: '100%',
    maxHeight: '100%',
    justifyContent: 'flex-end',
  },
  sideRoot: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    borderWidth: 1,
    alignSelf: 'center',
    width: '100%',
    maxHeight: '92%',
  },
  panelDialog: {
    marginTop: 0,
  },
  panelSheet: {
    marginTop: 'auto',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  /** Shrink with keyboard so nested result lists stay scrollable. */
  panelSheetShrink: {
    flexShrink: 1,
    minHeight: 0,
  },
  panelSheetWithFooter: {
    flexShrink: 1,
  },
  panelSideSheet: {
    marginTop: 0,
    alignSelf: 'stretch',
    height: '100%',
    maxHeight: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 0,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
      } as object,
      default: {},
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerCopy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    gap: 8,
    paddingBottom: 4,
  },
  sheetScrollBody: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  edgeScroll: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  sheetStaticBody: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  sheetFooter: {
    flexShrink: 0,
  },
});

export type { OverlaySize, Presentation };
