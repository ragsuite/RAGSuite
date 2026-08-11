import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
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
const PANEL_EASE = Easing.out(Easing.cubic);
const PANEL_EXIT_EASE = Easing.in(Easing.cubic);

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
      {showBubble && bubbleMessage.trim() ? (
        <AppChatWidgetBubbleHint
          message={bubbleMessage}
          backgroundColor={theme.panelBg}
          textColor={theme.heroTitleColor}
          borderColor={theme.panelBorderColor}
          visible
          onPress={onToggle}
        />
      ) : null}
      <AppChatWidgetLauncher
        config={config}
        customization={customization}
        loading={settingsLoading}
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
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { isOpen, toggle, close, config, displayCustomization, settingsLoading, chatbotActive } =
    useAppChatWidget();
  const [showBubble, setShowBubble] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const openProgress = useSharedValue(0);

  const hideWidget = segments.some((segment) => HIDDEN_WIDGET_SEGMENTS.has(segment));

  const layout = useAppChatWidgetLayout(insets, displayCustomization ?? undefined, {
    reserveLauncherSpace: true,
  });
  const isNative = Platform.OS !== 'web';
  /** Native always has the floating tab bar (web hides it). */
  const isNativeTabLayout = isNative;
  const keyboardInset = useAppChatWidgetKeyboardInset(isOpen, insets.bottom);
  const panelTravel = Math.min(Math.max(280, Math.round(windowHeight * 0.45)), 520);

  useEffect(() => {
    if (!config?.bubbleMessage?.trim() || isOpen) {
      setShowBubble(false);
      return;
    }
    const timer = setTimeout(() => setShowBubble(true), 500);
    return () => clearTimeout(timer);
  }, [config?.bubbleMessage, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPanelMounted(true);
      openProgress.value = withTiming(1, {
        duration: reducedMotion ? 0 : motion.bottomSheetEnter,
        easing: PANEL_EASE,
      });
      return;
    }

    if (!panelMounted) return;

    openProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : motion.bottomSheetExit,
        easing: PANEL_EXIT_EASE,
      },
      (finished) => {
        if (finished) runOnJS(setPanelMounted)(false);
      },
    );
  }, [isOpen, panelMounted, openProgress, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + openProgress.value * 0.65,
    transform: [{ translateY: (1 - openProgress.value) * panelTravel }],
  }));

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

  return (
    <View style={styles.host} pointerEvents="box-none">
      {panelMounted ? (
        <Modal
          visible={panelMounted}
          transparent
          animationType="none"
          onRequestClose={close}
          statusBarTranslucent
          accessibilityViewIsModal>
          <View style={styles.modalRoot}>
            <Animated.View style={[styles.backdropLayer, backdropStyle]} pointerEvents="box-none">
              <AppChatWidgetBackdrop onPress={close} />
            </Animated.View>

            <View
              style={[
                styles.openShell,
                {
                  paddingTop: insets.top + 8,
                  paddingBottom: openPanelReserveBottom,
                  // Native phone: full-bleed panel; gutters live in message list padding.
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
                    flex: 1,
                    width: layout.panelWidth,
                    maxWidth: '100%',
                    alignSelf: layout.isMobileLayout ? 'center' : undefined,
                  },
                  panelStyle,
                ]}>
                <AppChatWidgetPanel
                  config={config}
                  customization={displayCustomization}
                  onClose={close}
                  keyboardInset={keyboardInset}
                />
              </Animated.View>
            </View>

            {/* Web keeps floating launcher while open; native uses header Close only. */}
            {!isNative ? (
              <LauncherAnchor bottom={openLauncherBottom} showBubble={false} {...launcherProps} />
            ) : null}
          </View>
        </Modal>
      ) : null}

      {!isOpen ? (
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
