import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import {
  APP_CHAT_WIDGET_HOST_Z_INDEX,
  APP_CHAT_WIDGET_LAUNCHER_GAP,
  getAppChatWidgetLauncherSize,
  useAppChatWidgetLayout,
} from '@/features/app-chat-widget/utils/app-chat-widget-layout';
import {
  resolveAppChatWidgetTheme,
  type AppChatWidgetTheme,
} from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { canPaintEmbedLauncher } from '@/features/app-chat-widget/utils/embed-iframe-visibility';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

const PANEL_EASE = Easing.out(Easing.cubic);
const PANEL_EXIT_EASE = Easing.in(Easing.cubic);
const EMBED_MESSAGE_SOURCE = 'ragsuite-chatbot-embed';

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

function postEmbedResize(payload: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  position: string;
  open: boolean;
}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'resize', ...payload }, '*');
}

/**
 * Third-party embed host — same AppChatWidget UI as dashboard, without expo-router / tab bar.
 * Posts iframe resize messages so the parent loader can keep the frame tight around the widget.
 */
export function AppChatWidgetEmbedHost() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { isOpen, toggle, close, config, displayCustomization, settingsLoading, chatbotActive } =
    useAppChatWidget();
  const [showBubble, setShowBubble] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const openProgress = useSharedValue(0);

  const layout = useAppChatWidgetLayout(insets, displayCustomization ?? undefined, {
    reserveLauncherSpace: true,
  });
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

  useEffect(() => {
    const paint = { settingsLoading, chatbotActive, config, displayCustomization };
    if (!canPaintEmbedLauncher(paint)) return;
    const launcherSize = getAppChatWidgetLauncherSize(paint.displayCustomization.avatarSize ?? 38);
    const widgetBottomSpace = paint.displayCustomization.widgetBottomSpace ?? 0;
    const offsetX = Math.max(layout.horizontalInset, 12);
    const offsetY = resolveEmbedBottomInset(0, widgetBottomSpace);

    if (isOpen || panelMounted) {
      postEmbedResize({
        width: 0,
        height: 0,
        offsetX: 0,
        offsetY: 0,
        position: paint.config.position ?? 'bottom-right',
        open: true,
      });
      return;
    }

    const bubbleExtra = showBubble && paint.config.bubbleMessage?.trim() ? 56 : 0;
    postEmbedResize({
      width: launcherSize + 24,
      height: launcherSize + bubbleExtra + 24,
      offsetX,
      offsetY,
      position: paint.config.position ?? 'bottom-right',
      open: false,
    });
  }, [
    chatbotActive,
    config,
    displayCustomization,
    settingsLoading,
    isOpen,
    layout.horizontalInset,
    panelMounted,
    showBubble,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + openProgress.value * 0.65,
    transform: [{ translateY: (1 - openProgress.value) * panelTravel }],
  }));

  const paint = { settingsLoading, chatbotActive, config, displayCustomization };
  if (!canPaintEmbedLauncher(paint)) {
    return null;
  }

  const theme = resolveAppChatWidgetTheme(paint.config, paint.displayCustomization);
  const alignRight = paint.config.position !== 'bottom-left';
  const widgetBottomSpace = paint.displayCustomization.widgetBottomSpace ?? 0;
  const sideInset = layout.horizontalInset;
  const closedLauncherBottom = resolveEmbedBottomInset(insets.bottom, widgetBottomSpace);
  const openLauncherBottom =
    resolveEmbedBottomInset(insets.bottom, widgetBottomSpace) + keyboardInset;
  const openPanelReserveBottom = openLauncherBottom + layout.launcherSize + APP_CHAT_WIDGET_LAUNCHER_GAP;

  const launcherProps = {
    alignRight,
    sideInset,
    bubbleMessage: paint.config.bubbleMessage ?? '',
    theme,
    config: paint.config,
    customization: paint.displayCustomization,
    settingsLoading: false,
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
                  paddingHorizontal: layout.isMobileLayout ? layout.horizontalMargin : sideInset,
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
                  config={paint.config}
                  customization={paint.displayCustomization}
                  onClose={close}
                  keyboardInset={keyboardInset}
                />
              </Animated.View>
            </View>

            <LauncherAnchor bottom={openLauncherBottom} showBubble={false} {...launcherProps} />
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
    backgroundColor: 'transparent',
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
