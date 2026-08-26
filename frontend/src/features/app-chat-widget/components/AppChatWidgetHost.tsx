import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSegments } from 'expo-router';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppChatWidgetBackdrop } from '@/features/app-chat-widget/components/AppChatWidgetBackdrop';
import { AppChatWidgetBubbleHint } from '@/features/app-chat-widget/components/AppChatWidgetBubbleHint';
import { AppChatWidgetLauncher } from '@/features/app-chat-widget/components/AppChatWidgetLauncher';
import { AppChatWidgetPanel } from '@/features/app-chat-widget/components/AppChatWidgetPanel';
import { useAppChatWidgetKeyboardInset } from '@/features/app-chat-widget/hooks/use-app-chat-widget-keyboard-inset';
import { useChatWidgetBubbleHintVisibility } from '@/features/app-chat-widget/hooks/use-chat-widget-bubble-hint-visibility';
import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { resolveChatPanelDiagonalOffset } from '@/features/app-chat-widget/utils/chat-panel-diagonal-motion';
import { resolveAppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import {
  APP_CHAT_WIDGET_HOST_Z_INDEX,
  APP_CHAT_WIDGET_LAUNCHER_GAP,
  useAppChatWidgetLayout,
} from '@/features/app-chat-widget/utils/app-chat-widget-layout';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { getMobileTabBarStackHeight } from '@/shared/constants/mobile-tab-bar-layout';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

const HIDDEN_WIDGET_SEGMENTS = new Set(['onboarding', 'sign-out']);
/** Grow-from-launcher without overshoot (overshoot y>1 caused an end jump). */
const PANEL_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PANEL_EXIT_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

type LauncherAnchorProps = {
  bottom: number;
  alignRight: boolean;
  sideInset: number;
  showBubble: boolean;
  bubbleMessage: string;
  theme: AppChatWidgetTheme;
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  settingsLoading: boolean;
  isOpen?: boolean;
  onToggle: () => void;
};

function LauncherAnchor({
  bottom,
  alignRight,
  sideInset,
  showBubble,
  bubbleMessage,
  theme,
  config,
  customization,
  settingsLoading,
  isOpen = false,
  onToggle,
}: LauncherAnchorProps) {
  if (!config.showLauncher) return null;

  return (
    <View
      style={[
        styles.launcherAnchor,
        {
          bottom,
          zIndex: 3,
          elevation: 3,
          alignItems: alignRight ? 'flex-end' : 'flex-start',
          ...(alignRight ? { right: sideInset } : { left: sideInset }),
        },
      ]}>
      {bubbleMessage.trim() ? (
        <AppChatWidgetBubbleHint
          message={bubbleMessage}
          backgroundColor={theme.panelBg}
          textColor={theme.heroTitleColor}
          borderColor={theme.panelBorderColor}
          visible={showBubble}
          onPress={onToggle}
        />
      ) : null}
      <AppChatWidgetLauncher
        config={config}
        customization={customization}
        loading={settingsLoading}
        isOpen={isOpen}
        onPress={onToggle}
      />
    </View>
  );
}

function resolveEmbedBottomInset(safeAreaBottom: number, widgetBottomSpace: number): number {
  return Math.max(safeAreaBottom, 12) + widgetBottomSpace;
}

export function AppChatWidgetHost() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isOpen, toggle, close, config, displayCustomization, settingsLoading, chatbotActive } =
    useAppChatWidget();
  const showBubble = useChatWidgetBubbleHintVisibility(config?.bubbleMessage, isOpen);
  const [panelMounted, setPanelMounted] = useState(false);
  const [isPanelAnimating, setIsPanelAnimating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [launcherHandoffReady, setLauncherHandoffReady] = useState(true);
  const openProgress = useSharedValue(0);
  const modalHideRafRef = useRef<number | null>(null);

  const hideWidget = segments.some((segment) => HIDDEN_WIDGET_SEGMENTS.has(segment));

  const layout = useAppChatWidgetLayout(insets, displayCustomization ?? undefined, {
    reserveLauncherSpace: true,
  });
  const isNative = Platform.OS !== 'web';
  /** Native always has the floating tab bar (web hides it). */
  const isNativeTabLayout = isNative;
  const keyboardInset = useAppChatWidgetKeyboardInset(isOpen, insets.bottom);
  const panelInteractive = isOpen || isPanelAnimating;
  const showBackdrop = Boolean(displayCustomization?.showBackdrop);
  /** Web without backdrop must not use Modal — it blocks the page underneath. */
  const useModalShell = isNative || showBackdrop;

  const clearModalHideRaf = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (modalHideRafRef.current === null) return;
    cancelAnimationFrame(modalHideRafRef.current);
    modalHideRafRef.current = null;
  }, []);

  const finalizeCloseLifecycle = useCallback(() => {
    setIsPanelAnimating(false);
    if (!useModalShell) {
      setModalVisible(false);
      setLauncherHandoffReady(true);
      return;
    }
    if (Platform.OS === 'web') {
      clearModalHideRaf();
      modalHideRafRef.current = requestAnimationFrame(() => {
        modalHideRafRef.current = null;
        setModalVisible(false);
        setLauncherHandoffReady(true);
      });
      return;
    }
    setModalVisible(false);
    setLauncherHandoffReady(true);
  }, [clearModalHideRaf, useModalShell]);

  useEffect(() => () => clearModalHideRaf(), [clearModalHideRaf]);

  useEffect(() => {
    if (isOpen) {
      clearModalHideRaf();
      setPanelMounted(true);
      setIsPanelAnimating(true);
      if (useModalShell) setModalVisible(true);
      openProgress.value = withTiming(
        1,
        {
          duration: reducedMotion ? 0 : motion.chatPanelEnter,
          easing: PANEL_EASE,
        },
        (finished) => {
          if (finished) runOnJS(setIsPanelAnimating)(false);
        },
      );
      return;
    }

    if (!panelMounted) return;

    clearModalHideRaf();
    setIsPanelAnimating(true);
    setLauncherHandoffReady(!useModalShell);
    openProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : motion.chatPanelExit,
        easing: PANEL_EXIT_EASE,
      },
      (finished) => {
        if (finished) runOnJS(finalizeCloseLifecycle)();
      },
    );
  }, [
    clearModalHideRaf,
    finalizeCloseLifecycle,
    isOpen,
    openProgress,
    panelMounted,
    reducedMotion,
    useModalShell,
  ]);

  useEffect(() => {
    if (useModalShell) return;
    setModalVisible(false);
    setLauncherHandoffReady(true);
  }, [useModalShell]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
  }));
  const panelPosition = config?.position ?? 'bottom-right';
  const diagonalOffset = resolveChatPanelDiagonalOffset({
    position: panelPosition,
    launcherSize: layout.launcherSize,
  });

  const panelStyle = useAnimatedStyle(() => {
    const progress = openProgress.value;
    // Opacity finishes ~2× faster than scale (SalesIQ: opacity 0.2s vs transform 0.4s).
    const opacity = progress <= 0 ? 0 : Math.min(1, progress * 2);
    return {
      opacity,
      transform: [
        { translateX: (1 - progress) * diagonalOffset.startX },
        { translateY: (1 - progress) * diagonalOffset.startY },
        { scale: diagonalOffset.startScale + (1 - diagonalOffset.startScale) * progress },
      ],
    };
  });

  if (hideWidget || !config || !displayCustomization || !chatbotActive) {
    return null;
  }

  const theme = resolveAppChatWidgetTheme(config, displayCustomization);
  const alignRight = config.position !== 'bottom-left';
  const widgetBottomSpace = displayCustomization.widgetBottomSpace ?? 0;
  const sideInset = layout.horizontalInset;

  // Closed: sit directly above the floating pill tab bar (native tabs only).
  const closedLauncherBottom = isNativeTabLayout
    ? getMobileTabBarStackHeight(insets.bottom) + widgetBottomSpace
    : resolveEmbedBottomInset(insets.bottom, widgetBottomSpace);

  // Open modal: reference embed uses widget bottom space + safe area (tab bar is covered).
  // Native: hide launcher while open (full-screen chat) — only reserve safe area + keyboard.
  const openLauncherBottom =
    resolveEmbedBottomInset(insets.bottom, widgetBottomSpace) + keyboardInset;
  const openPanelReserveBottom = isNative
    ? openLauncherBottom
    : openLauncherBottom + layout.launcherSize + APP_CHAT_WIDGET_LAUNCHER_GAP;

  const launcherProps = {
    alignRight,
    sideInset,
    bubbleMessage: config.bubbleMessage ?? '',
    theme,
    config,
    customization: displayCustomization,
    settingsLoading,
    onToggle: toggle,
  };

  const openPanel = (
    <>
      {showBackdrop ? (
        <Animated.View
          style={[styles.backdropLayer, backdropStyle]}
          pointerEvents={panelInteractive ? 'auto' : 'none'}>
          <AppChatWidgetBackdrop onPress={close} />
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.openShell,
          {
            paddingTop: insets.top + 8,
            paddingBottom: openPanelReserveBottom,
            paddingHorizontal:
              isNative && layout.isMobileLayout
                ? 0
                : layout.isMobileLayout
                  ? layout.horizontalMargin
                  : sideInset,
            alignItems: layout.isMobileLayout
              ? 'stretch'
              : alignRight
                ? 'flex-end'
                : 'flex-start',
          },
        ]}
        pointerEvents="box-none">
        <Animated.View
          style={[
            {
              height: layout.panelHeight,
              maxHeight: '100%',
              width: layout.panelWidth,
              maxWidth: '100%',
              alignSelf: layout.isMobileLayout ? 'center' : undefined,
              transformOrigin: diagonalOffset.transformOrigin,
            },
            panelStyle,
          ]}
          pointerEvents={panelInteractive ? 'auto' : 'none'}>
          <AppChatWidgetPanel
            config={config}
            customization={displayCustomization}
            onClose={close}
            keyboardInset={keyboardInset}
          />
        </Animated.View>
      </View>

      {/* Modal/web-backdrop: keep launcher mounted for full Modal lifetime so close morph runs. */}
      {!isNative && useModalShell ? (
        <LauncherAnchor
          bottom={openLauncherBottom}
          showBubble={false}
          {...launcherProps}
          isOpen={isOpen}
        />
      ) : null}
    </>
  );

  return (
    <View style={styles.host} pointerEvents="box-none">
      {panelMounted && useModalShell ? (
        <Modal
          visible={modalVisible}
          transparent
          animationType="none"
          onRequestClose={close}
          statusBarTranslucent
          accessibilityViewIsModal={showBackdrop}>
          <View style={styles.modalRoot} pointerEvents={showBackdrop ? 'auto' : 'box-none'}>
            {openPanel}
          </View>
        </Modal>
      ) : null}

      {panelMounted && !useModalShell ? (
        <View style={styles.passThroughRoot} pointerEvents="box-none">
          {openPanel}
        </View>
      ) : null}

      {/* Web backdrop-OFF: one continuous root launcher (Preview parity open+close morph). */}
      {!isNative && !useModalShell ? (
        <LauncherAnchor
          bottom={panelInteractive ? openLauncherBottom : closedLauncherBottom}
          showBubble={!panelInteractive && showBubble}
          {...launcherProps}
          isOpen={isOpen}
        />
      ) : null}

      {/* Modal/backdrop-ON: closed root launcher only after Modal fully dismisses. */}
      {!isNative && useModalShell && !modalVisible && launcherHandoffReady ? (
        <LauncherAnchor
          bottom={closedLauncherBottom}
          showBubble={showBubble}
          {...launcherProps}
          isOpen={false}
        />
      ) : null}

      {/* Native: floating launcher only while closed. */}
      {isNative && !panelInteractive && launcherHandoffReady ? (
        <LauncherAnchor bottom={closedLauncherBottom} showBubble={showBubble} {...launcherProps} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: APP_CHAT_WIDGET_HOST_Z_INDEX,
    elevation: APP_CHAT_WIDGET_HOST_Z_INDEX,
    pointerEvents: 'box-none',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  passThroughRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  openShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
    justifyContent: 'flex-end',
  },
  launcherAnchor: {
    position: 'absolute',
    zIndex: 3,
    elevation: 3,
    pointerEvents: 'box-none',
  },
});
