import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
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
import { resolveChatPanelDiagonalOffset } from '@/features/app-chat-widget/utils/chat-panel-diagonal-motion';
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
import {
  resolveChatEmbedIframeOffset,
  resolveChatEmbedInnerLauncherInset,
} from '@/features/app-chat-widget/utils/chat-embed-iframe-insets';
import {
  measureClosedChatEmbedFrame,
  resolveClosedChatEmbedFrameSize,
  resolveOpenChatEmbedFrameSize,
} from '@/features/app-chat-widget/utils/closed-chat-embed-frame';
import {
  mergeChatEmbedConfigOverlay,
  mergeChatEmbedThemeOverlay,
  parseChatEmbedThemeMessage,
  type ChatEmbedConfigOverlay,
  type ChatEmbedThemeOverlay,
} from '@/features/app-chat-widget/utils/chat-embed-theme-overlay';
import {
  parseChatEmbedHostViewportMessage,
  type ChatEmbedHostViewport,
} from '@/features/app-chat-widget/utils/chat-embed-host-viewport';
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
  measureRef?: React.RefObject<View | null>;
  onMeasureLayout?: (width: number, height: number) => void;
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
  measureRef,
  onMeasureLayout,
}: LauncherAnchorProps) {
  if (!config.showLauncher) return null;

  return (
    <View
      ref={measureRef}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        onMeasureLayout?.(width, height);
      }}
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
          key={bubbleMessage}
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

function postEmbedResize(payload: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  position: string;
  open: boolean;
  cover?: boolean;
}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'resize', ...payload }, '*');
}

function postEmbedHidden(reason: 'inactive' | 'error') {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'hidden', reason }, '*');
}

/**
 * Third-party embed host — same AppChatWidget UI as dashboard, without expo-router / tab bar.
 * Posts iframe resize messages so the parent loader can keep the frame tight around the widget.
 */
export function AppChatWidgetEmbedHost() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isOpen, toggle, close, config, displayCustomization, settingsLoading, chatbotActive } =
    useAppChatWidget();
  const [showBubble, setShowBubble] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [themeOverlay, setThemeOverlay] = useState<ChatEmbedThemeOverlay | null>(null);
  const [configOverlay, setConfigOverlay] = useState<ChatEmbedConfigOverlay | null>(null);
  const [measuredLauncher, setMeasuredLauncher] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [hostViewport, setHostViewport] = useState<ChatEmbedHostViewport | null>(null);
  const openProgress = useSharedValue(0);
  const closedLauncherRef = useRef<View>(null);

  const effectiveCustomization = useMemo(
    () => mergeChatEmbedThemeOverlay(displayCustomization, themeOverlay),
    [displayCustomization, themeOverlay],
  );
  const effectiveConfig = useMemo(
    () => mergeChatEmbedConfigOverlay(config, configOverlay),
    [config, configOverlay],
  );

  const layout = useAppChatWidgetLayout(insets, effectiveCustomization ?? undefined, {
    reserveLauncherSpace: true,
    viewportOverride: hostViewport,
  });
  const keyboardInset = useAppChatWidgetKeyboardInset(isOpen, insets.bottom);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const viewport = parseChatEmbedHostViewportMessage(event.data);
      if (viewport) {
        setHostViewport((prev) =>
          prev && prev.width === viewport.width && prev.height === viewport.height ? prev : viewport,
        );
        return;
      }
      const parsed = parseChatEmbedThemeMessage(event.data);
      if (!parsed) return;
      if (Object.keys(parsed.customization).length > 0) {
        setThemeOverlay((prev) => ({ ...(prev ?? {}), ...parsed.customization }));
      }
      if (Object.keys(parsed.config).length > 0) {
        setConfigOverlay((prev) => ({ ...(prev ?? {}), ...parsed.config }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!effectiveConfig?.bubbleMessage?.trim() || isOpen) {
      setShowBubble(false);
      return;
    }
    const timer = setTimeout(() => setShowBubble(true), 500);
    return () => clearTimeout(timer);
  }, [effectiveConfig?.bubbleMessage, isOpen]);

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

  const reportClosedLauncherSize = useCallback((width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    setMeasuredLauncher((prev) => {
      if (prev && prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const measureClosedFrameFromDom = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const node = closedLauncherRef.current as unknown as HTMLElement | null;
    const measured = measureClosedChatEmbedFrame(node);
    if (measured) reportClosedLauncherSize(measured.width, measured.height);
  }, [reportClosedLauncherSize]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined') return;
    if (isOpen || panelMounted) return;
    const node = closedLauncherRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      measureClosedFrameFromDom();
    });
    observer.observe(node);
    measureClosedFrameFromDom();
    return () => observer.disconnect();
  }, [
    isOpen,
    panelMounted,
    showBubble,
    measureClosedFrameFromDom,
    effectiveCustomization,
    effectiveConfig,
  ]);

  useEffect(() => {
    if (!showBubble || isOpen || panelMounted) return;
    if (Platform.OS !== 'web' || typeof requestAnimationFrame !== 'function') return;
    const raf1 = requestAnimationFrame(() => {
      measureClosedFrameFromDom();
      requestAnimationFrame(() => measureClosedFrameFromDom());
    });
    return () => cancelAnimationFrame(raf1);
  }, [showBubble, effectiveConfig?.bubbleMessage, isOpen, panelMounted, measureClosedFrameFromDom]);

  useEffect(() => {
    const paint = {
      settingsLoading,
      chatbotActive,
      config: effectiveConfig,
      displayCustomization: effectiveCustomization,
    };
    if (settingsLoading) return;
    if (!canPaintEmbedLauncher(paint)) {
      postEmbedHidden(chatbotActive === false ? 'inactive' : 'error');
      return;
    }
    const launcherSize = getAppChatWidgetLauncherSize(paint.displayCustomization.avatarSize ?? 38);
    const widgetBottomSpace = paint.displayCustomization.widgetBottomSpace ?? 0;
    const { offsetX, offsetY } = resolveChatEmbedIframeOffset({
      widgetBottomSpace,
      horizontalInset: layout.horizontalInset,
    });
    const showBackdrop = Boolean(paint.displayCustomization.showBackdrop);

    if (isOpen || panelMounted) {
      if (showBackdrop) {
        postEmbedResize({
          width: 0,
          height: 0,
          offsetX: 0,
          offsetY: 0,
          position: paint.config.position ?? 'bottom-right',
          open: true,
          cover: true,
        });
        return;
      }
      if (!hostViewport) return;
      const openFrame = resolveOpenChatEmbedFrameSize({
        panelWidth: layout.panelWidth,
        panelHeight: layout.panelHeight,
        launcherSize: layout.launcherSize,
        launcherGap: APP_CHAT_WIDGET_LAUNCHER_GAP,
      });
      postEmbedResize({
        width: openFrame.width,
        height: openFrame.height,
        offsetX,
        offsetY: offsetY + keyboardInset,
        position: paint.config.position ?? 'bottom-right',
        open: true,
        cover: false,
      });
      return;
    }

    const frame = resolveClosedChatEmbedFrameSize({
      measured: measuredLauncher,
      launcherSize,
      showBubble: Boolean(showBubble && paint.config.bubbleMessage?.trim()),
    });
    postEmbedResize({
      width: frame.width,
      height: frame.height,
      offsetX,
      offsetY,
      position: paint.config.position ?? 'bottom-right',
      open: false,
    });
  }, [
    chatbotActive,
    effectiveConfig,
    effectiveCustomization,
    settingsLoading,
    isOpen,
    layout.horizontalInset,
    layout.panelWidth,
    layout.panelHeight,
    layout.launcherSize,
    keyboardInset,
    panelMounted,
    measuredLauncher,
    showBubble,
    hostViewport,
  ]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
  }));
  const panelPosition = effectiveConfig?.position ?? 'bottom-right';
  const diagonalOffset = resolveChatPanelDiagonalOffset({
    position: panelPosition,
    launcherSize: layout.launcherSize,
  });

  const panelStyle = useAnimatedStyle(() => {
    const progress = openProgress.value;
    return {
      opacity: 0.35 + progress * 0.65,
      transform: [
        { translateX: (1 - progress) * diagonalOffset.startX },
        { translateY: (1 - progress) * diagonalOffset.startY },
        { scale: diagonalOffset.startScale + (1 - diagonalOffset.startScale) * progress },
      ],
    };
  });

  const paint = {
    settingsLoading,
    chatbotActive,
    config: effectiveConfig,
    displayCustomization: effectiveCustomization,
  };
  if (!canPaintEmbedLauncher(paint)) {
    return null;
  }

  const theme = resolveAppChatWidgetTheme(paint.config, paint.displayCustomization);
  const alignRight = paint.config.position !== 'bottom-left';
  const widgetBottomSpace = paint.displayCustomization.widgetBottomSpace ?? 0;
  const showBackdrop = Boolean(paint.displayCustomization.showBackdrop);
  const isNative = Platform.OS !== 'web';
  const useModalShell = isNative || showBackdrop;
  const coverFullscreen = Boolean(useModalShell && showBackdrop);
  const closedInner = resolveChatEmbedInnerLauncherInset({
    keyboardInset: 0,
    isOpen: false,
  });
  const openInner = resolveChatEmbedInnerLauncherInset({
    keyboardInset,
    isOpen: true,
    coverFullscreen,
    widgetBottomSpace,
    horizontalInset: layout.horizontalInset,
  });
  const openPanelReserveBottom =
    openInner.bottom + layout.launcherSize + APP_CHAT_WIDGET_LAUNCHER_GAP;
  const openShellSidePad = coverFullscreen
    ? layout.isMobileLayout
      ? layout.horizontalMargin
      : openInner.side
    : layout.isMobileLayout
      ? layout.horizontalMargin
      : 0;

  const launcherProps = {
    alignRight,
    sideInset: openInner.side,
    bubbleMessage: paint.config.bubbleMessage ?? '',
    theme,
    config: paint.config,
    customization: paint.displayCustomization,
    settingsLoading: false,
    onToggle: toggle,
  };

  const openPanel = (
    <>
      {showBackdrop ? (
        <Animated.View style={[styles.backdropLayer, backdropStyle]} pointerEvents="auto">
          <AppChatWidgetBackdrop onPress={close} />
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.openShell,
          {
            paddingTop: insets.top + 8,
            paddingBottom: openPanelReserveBottom,
            paddingHorizontal: openShellSidePad,
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
          pointerEvents="auto">
          <AppChatWidgetPanel
            config={paint.config}
            customization={paint.displayCustomization}
            onClose={close}
            keyboardInset={keyboardInset}
          />
        </Animated.View>
      </View>

      <LauncherAnchor bottom={openInner.bottom} showBubble={false} {...launcherProps} />
    </>
  );

  return (
    <View style={styles.host} pointerEvents="box-none">
      {panelMounted && useModalShell ? (
        <Modal
          visible={panelMounted}
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

      {!isOpen ? (
        <LauncherAnchor
          bottom={closedInner.bottom}
          showBubble={showBubble}
          measureRef={closedLauncherRef}
          onMeasureLayout={reportClosedLauncherSize}
          {...launcherProps}
          sideInset={closedInner.side}
        />
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
  passThroughRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
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
