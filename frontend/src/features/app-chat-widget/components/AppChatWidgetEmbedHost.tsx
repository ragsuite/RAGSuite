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
import { useChatWidgetBubbleHintVisibility } from '@/features/app-chat-widget/hooks/use-chat-widget-bubble-hint-visibility';
import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { resolveChatPanelDiagonalOffset, resolveChatPanelOpacity } from '@/features/app-chat-widget/utils/chat-panel-diagonal-motion';
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
  resolveOpenChatEmbedPanelHeightForFrame,
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
import {
  canPaintEmbedLauncher,
  shouldCoverChatEmbedIframe,
} from '@/features/app-chat-widget/utils/embed-iframe-visibility';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

/** Grow-from-launcher without overshoot (overshoot y>1 caused an end jump). */
const PANEL_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PANEL_EXIT_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
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
  isOpen?: boolean;
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
  isOpen = false,
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
          alignItems: alignRight ? 'flex-end' : 'flex-start',
          ...(alignRight ? { right: sideInset } : { left: sideInset }),
        },
      ]}>
      {bubbleMessage.trim() ? (
        <AppChatWidgetBubbleHint
          key={bubbleMessage}
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

function postEmbedResize(payload: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  position: string;
  open: boolean;
  cover?: boolean;
  shellScale?: number;
  transformOrigin?: 'bottom right' | 'bottom left';
}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'resize', ...payload }, '*');
}

function postEmbedHidden(reason: 'inactive' | 'error' | 'unauthorized-origin') {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ source: EMBED_MESSAGE_SOURCE, type: 'hidden', reason }, '*');
}

function isLoopbackParentOrigin(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.parent === window) {
    return false;
  }
  try {
    const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
      .ancestorOrigins;
    if (!ancestors || ancestors.length === 0) return false;
    const host = new URL(String(ancestors[0])).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Third-party embed host — same AppChatWidget UI as dashboard, without expo-router / tab bar.
 * Closed / open-without-backdrop: tight corner iframe (host page stays clickable);
 * panel sits in a plain pinned wrapper above a continuous absolute launcher.
 * Open with backdrop: fullscreen cover + dimmed openShell.
 */
export function AppChatWidgetEmbedHost() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isOpen, toggle, close, config, displayCustomization, settingsLoading, chatbotActive } =
    useAppChatWidget();
  const [panelMounted, setPanelMounted] = useState(false);
  const [isPanelAnimating, setIsPanelAnimating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [launcherHandoffReady, setLauncherHandoffReady] = useState(true);
  const [themeOverlay, setThemeOverlay] = useState<ChatEmbedThemeOverlay | null>(null);
  const [configOverlay, setConfigOverlay] = useState<ChatEmbedConfigOverlay | null>(null);
  const [measuredLauncher, setMeasuredLauncher] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [hostViewport, setHostViewport] = useState<ChatEmbedHostViewport | null>(null);
  const openProgress = useSharedValue(0);
  const closingSv = useSharedValue(0);
  const closedLauncherRef = useRef<View>(null);
  const closedMeasureFrozenRef = useRef(false);
  const modalHideRafRef = useRef<number | null>(null);
  const openEnterRafRef = useRef<number | null>(null);
  /** Latest closed corner resize — posted sync on cover/exit before Modal teardown. */
  const pendingClosedResizeRef = useRef<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    position: string;
    open: false;
    shellScale: number;
    transformOrigin: 'bottom right' | 'bottom left';
  } | null>(null);
  /** Last closed size actually sent to the host — skip duplicate posts that cause a second snap. */
  const lastPostedClosedResizeKeyRef = useRef<string | null>(null);
  /**
   * Backdrop-ON cover lock: keep host shell fullscreen from first cover post until
   * exit animation fully finishes — blocks the isOpen/isPanelAnimating one-commit gap
   * that otherwise posts open:false mid-close (fullscreen ↔ corner thrash on third-party).
   */
  const coverSessionActiveRef = useRef(false);
  const panelMountedRef = useRef(false);
  const panelInteractive = isOpen || isPanelAnimating;

  const effectiveCustomization = useMemo(
    () => mergeChatEmbedThemeOverlay(displayCustomization, themeOverlay),
    [displayCustomization, themeOverlay],
  );
  const effectiveConfig = useMemo(
    () => mergeChatEmbedConfigOverlay(config, configOverlay),
    [config, configOverlay],
  );
  const showBubble = useChatWidgetBubbleHintVisibility(effectiveConfig?.bubbleMessage, isOpen);

  const layout = useAppChatWidgetLayout(insets, effectiveCustomization ?? undefined, {
    reserveLauncherSpace: true,
    viewportOverride: hostViewport,
  });
  const keyboardInset = useAppChatWidgetKeyboardInset(isOpen, insets.bottom);
  const isNative = Platform.OS !== 'web';
  const showBackdropSetting = Boolean(effectiveCustomization?.showBackdrop);
  /** Web without backdrop must not use Modal — it blocks the page underneath. */
  const useModalShell = isNative || showBackdropSetting;

  const clearModalHideRaf = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (modalHideRafRef.current === null) return;
    cancelAnimationFrame(modalHideRafRef.current);
    modalHideRafRef.current = null;
  }, []);

  const clearOpenEnterRaf = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (openEnterRafRef.current === null) return;
    cancelAnimationFrame(openEnterRafRef.current);
    openEnterRafRef.current = null;
  }, []);

  useEffect(() => () => {
    clearModalHideRaf();
    clearOpenEnterRaf();
  }, [clearModalHideRaf, clearOpenEnterRaf]);

  useEffect(() => {
    if (useModalShell) return;
    setModalVisible(false);
    setLauncherHandoffReady(true);
  }, [useModalShell]);

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
        // Later theme posts must update bubbleMessage / labels live (not apply-once).
        setConfigOverlay((prev) => ({ ...(prev ?? {}), ...parsed.config }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // New hint copy can change closed shell size — allow remeasure after live theme updates.
  useEffect(() => {
    if (configOverlay?.bubbleMessage === undefined) return;
    closedMeasureFrozenRef.current = false;
  }, [configOverlay?.bubbleMessage]);

  useEffect(() => {
    if (!isLoopbackParentOrigin()) return;
    postEmbedHidden('unauthorized-origin');
  }, []);

  const finalizeCoverClose = useCallback(() => {
    coverSessionActiveRef.current = false;
    if (!useModalShell) {
      // OFF: finish exit paint, then shrink host shell (avoids close-end hitch).
      if (Platform.OS === 'web') {
        clearModalHideRaf();
        modalHideRafRef.current = requestAnimationFrame(() => {
          modalHideRafRef.current = null;
          const closed = pendingClosedResizeRef.current;
          if (closed) {
            lastPostedClosedResizeKeyRef.current = `${closed.width}x${closed.height}`;
            postEmbedResize(closed);
          }
          setIsPanelAnimating(false);
          setModalVisible(false);
          setLauncherHandoffReady(true);
        });
        return;
      }
      const closed = pendingClosedResizeRef.current;
      if (closed) {
        lastPostedClosedResizeKeyRef.current = `${closed.width}x${closed.height}`;
        postEmbedResize(closed);
      }
      setIsPanelAnimating(false);
      setModalVisible(false);
      setLauncherHandoffReady(true);
      return;
    }

    // ON: shrink host shell before Modal teardown so empty fullscreen never paints.
    const closed = pendingClosedResizeRef.current;
    if (closed) {
      lastPostedClosedResizeKeyRef.current = `${closed.width}x${closed.height}`;
      postEmbedResize(closed);
    }
    setIsPanelAnimating(false);
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

  useEffect(() => {
    if (isOpen) {
      clearModalHideRaf();
      clearOpenEnterRaf();
      setPanelMounted(true);
      panelMountedRef.current = true;
      setIsPanelAnimating(true);
      if (useModalShell) {
        setModalVisible(true);
        closingSv.value = 0;
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

      // OFF: resize effect expands the corner shell first; animate on the next frames.
      const startEnter = () => {
        openEnterRafRef.current = null;
        closingSv.value = 0;
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
      };
      if (Platform.OS === 'web' && typeof requestAnimationFrame === 'function') {
        openEnterRafRef.current = requestAnimationFrame(() => {
          openEnterRafRef.current = requestAnimationFrame(startEnter);
        });
      } else {
        startEnter();
      }
      return;
    }

    if (!panelMountedRef.current) return;

    clearModalHideRaf();
    clearOpenEnterRaf();
    setIsPanelAnimating(true);
    setLauncherHandoffReady(!useModalShell);
    closingSv.value = 1;
    openProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : motion.chatPanelExit,
        easing: PANEL_EXIT_EASE,
      },
      (finished) => {
        if (finished) runOnJS(finalizeCoverClose)();
      },
    );
  }, [
    clearModalHideRaf,
    clearOpenEnterRaf,
    closingSv,
    finalizeCoverClose,
    isOpen,
    openProgress,
    reducedMotion,
    useModalShell,
  ]);

  const reportClosedLauncherSize = useCallback((width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    if (closedMeasureFrozenRef.current) return;
    setMeasuredLauncher((prev) => {
      if (prev && prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  useEffect(() => {
    closedMeasureFrozenRef.current = false;
  }, [effectiveConfig?.bubbleMessage, effectiveCustomization?.avatarSize, showBubble]);

  useEffect(() => {
    if (!measuredLauncher) return;
    const timer = setTimeout(() => {
      closedMeasureFrozenRef.current = true;
    }, 120);
    return () => clearTimeout(timer);
  }, [measuredLauncher, showBubble, effectiveConfig?.bubbleMessage]);

  const measureClosedFrameFromDom = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const node = closedLauncherRef.current as unknown as HTMLElement | null;
    const measured = measureClosedChatEmbedFrame(node);
    if (measured) reportClosedLauncherSize(measured.width, measured.height);
  }, [reportClosedLauncherSize]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined') return;
    if (isOpen || isPanelAnimating) return;
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
    isPanelAnimating,
    showBubble,
    measureClosedFrameFromDom,
    effectiveCustomization,
    effectiveConfig,
  ]);

  useEffect(() => {
    if (isOpen || isPanelAnimating) return;
    if (Platform.OS !== 'web' || typeof requestAnimationFrame !== 'function') return;
    const raf1 = requestAnimationFrame(() => {
      measureClosedFrameFromDom();
      requestAnimationFrame(() => measureClosedFrameFromDom());
    });
    return () => cancelAnimationFrame(raf1);
  }, [showBubble, effectiveConfig?.bubbleMessage, isOpen, isPanelAnimating, measureClosedFrameFromDom]);

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
    const launcherSizeForClosed = launcherSize;
    // Closed shell tracks runtime showBubble so auto-hide can shrink after the teaser.
    // Open/close paths above return early while isOpen || isPanelAnimating — no mid-anim snap.
    const closedFrame = resolveClosedChatEmbedFrameSize({
      measured: measuredLauncher,
      launcherSize: launcherSizeForClosed,
      showBubble,
    });
    const closedTransformOrigin =
      (paint.config.position ?? 'bottom-right') === 'bottom-left'
        ? ('bottom left' as const)
        : ('bottom right' as const);
    pendingClosedResizeRef.current = {
      width: closedFrame.width,
      height: closedFrame.height,
      offsetX,
      offsetY,
      position: paint.config.position ?? 'bottom-right',
      open: false,
      shellScale: 1,
      transformOrigin: closedTransformOrigin,
    };

    const keepCoverSession =
      showBackdrop && (isOpen || isPanelAnimating || coverSessionActiveRef.current);

    if (keepCoverSession) {
      // Cover owns fullscreen for the whole open→exit session.
      // Defer first cover until Modal/panel can paint (avoids empty fullscreen flash).
      if (!panelMounted) return;
      coverSessionActiveRef.current = true;
      lastPostedClosedResizeKeyRef.current = null;
      postEmbedResize({
        width: 0,
        height: 0,
        offsetX: 0,
        offsetY: 0,
        position: paint.config.position ?? 'bottom-right',
        open: true,
        cover: true,
        shellScale: 1,
      });
      return;
    }

    // Keep open corner frame for the whole open→exit animation (no closed snap mid-close).
    if (isOpen || isPanelAnimating) {
      // Tight corner iframe — fullscreen cover would steal host-page clicks.
      if (!hostViewport) return;
      const pageOffsetY = offsetY + keyboardInset;
      const openFrame = resolveOpenChatEmbedFrameSize({
        panelWidth: layout.panelWidth,
        panelHeight: layout.panelHeight,
        launcherSize: layout.launcherSize,
        launcherGap: APP_CHAT_WIDGET_LAUNCHER_GAP,
        pad: 0,
        maxHeight: Math.max(360, hostViewport.height - pageOffsetY),
      });
      const transformOrigin =
        (paint.config.position ?? 'bottom-right') === 'bottom-left'
          ? ('bottom left' as const)
          : ('bottom right' as const);
      lastPostedClosedResizeKeyRef.current = null;
      // Dashboard-parity motion is in-iframe; host shell stays unscaled (shellScale: 1).
      postEmbedResize({
        width: openFrame.width,
        height: openFrame.height,
        offsetX,
        offsetY: pageOffsetY,
        position: paint.config.position ?? 'bottom-right',
        open: true,
        cover: false,
        shellScale: 1,
        transformOrigin,
      });
      return;
    }

    coverSessionActiveRef.current = false;
    const closed = pendingClosedResizeRef.current;
    if (!closed) return;
    // Closed size is posted from finalizeCoverClose first; skip duplicates here.
    const closedKey = `${closed.width}x${closed.height}`;
    if (lastPostedClosedResizeKeyRef.current === closedKey) return;
    lastPostedClosedResizeKeyRef.current = closedKey;
    postEmbedResize(closed);
  }, [
    chatbotActive,
    effectiveConfig,
    effectiveCustomization,
    settingsLoading,
    isOpen,
    isPanelAnimating,
    panelMounted,
    layout.horizontalInset,
    layout.panelWidth,
    layout.panelHeight,
    layout.launcherSize,
    keyboardInset,
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

  // Match dashboard Host: always diagonal panel motion (never host CSS shellScale).
  const panelStyle = useAnimatedStyle(() => {
    const progress = openProgress.value;
    const opacity = resolveChatPanelOpacity(progress, closingSv.value === 1);
    return {
      opacity,
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
  const coverFullscreen = shouldCoverChatEmbedIframe({ open: true, showBackdrop });
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
      : layout.horizontalInset
    : 0;
  const openShellAlignItems = coverFullscreen
    ? layout.isMobileLayout
      ? ('stretch' as const)
      : alignRight
        ? ('flex-end' as const)
        : ('flex-start' as const)
    : alignRight
      ? ('flex-end' as const)
      : ('flex-start' as const);
  const pageOffsetY =
    resolveChatEmbedIframeOffset({
      widgetBottomSpace,
      horizontalInset: layout.horizontalInset,
    }).offsetY + keyboardInset;
  const preferredOpenFrame = resolveOpenChatEmbedFrameSize({
    panelWidth: layout.panelWidth,
    panelHeight: layout.panelHeight,
    launcherSize: layout.launcherSize,
    launcherGap: APP_CHAT_WIDGET_LAUNCHER_GAP,
    pad: 0,
  });
  const openFrame = resolveOpenChatEmbedFrameSize({
    panelWidth: layout.panelWidth,
    panelHeight: layout.panelHeight,
    launcherSize: layout.launcherSize,
    launcherGap: APP_CHAT_WIDGET_LAUNCHER_GAP,
    pad: 0,
    maxHeight: hostViewport ? Math.max(360, hostViewport.height - pageOffsetY) : undefined,
  });
  const frameWasClamped = openFrame.height < preferredOpenFrame.height;
  const openPanelHeight = coverFullscreen
    ? layout.panelHeight
    : frameWasClamped
      ? resolveOpenChatEmbedPanelHeightForFrame({
          frameHeight: openFrame.height,
          launcherSize: layout.launcherSize,
          launcherGap: APP_CHAT_WIDGET_LAUNCHER_GAP,
          preferredHeight: layout.panelHeight,
          pad: 0,
        })
      : layout.panelHeight;
  const panelLayoutSize = { width: layout.panelWidth, height: openPanelHeight };
  const pinnedPanelBottom =
    openInner.bottom + layout.launcherSize + APP_CHAT_WIDGET_LAUNCHER_GAP;

  const launcherProps = {
    alignRight,
    sideInset: coverFullscreen ? layout.horizontalInset : openInner.side,
    // Always from merged effective config so later host theme.bubbleMessage updates the hint.
    bubbleMessage: effectiveConfig?.bubbleMessage ?? '',
    theme,
    config: paint.config,
    customization: paint.displayCustomization,
    settingsLoading: false,
    onToggle: toggle,
  };

  const openPanel = (
    <>
      {showBackdrop ? (
        <Animated.View
          style={[styles.backdropLayer, backdropStyle]}
          pointerEvents={panelInteractive ? 'auto' : 'none'}>
          <AppChatWidgetBackdrop onPress={close} disableBlur />
        </Animated.View>
      ) : null}

      {coverFullscreen ? (
        <View
          style={[
            styles.openShell,
            {
              paddingTop: insets.top + 8,
              paddingBottom: openPanelReserveBottom,
              paddingHorizontal: openShellSidePad,
              alignItems: openShellAlignItems,
            },
          ]}
          pointerEvents="box-none">
          <Animated.View
            style={[
              {
                height: openPanelHeight,
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
              config={paint.config}
              customization={paint.displayCustomization}
              onClose={close}
              keyboardInset={keyboardInset}
              layoutSize={panelLayoutSize}
            />
          </Animated.View>
        </View>
      ) : (
        <View
          style={[
            styles.cornerPanelPin,
            {
              bottom: pinnedPanelBottom,
              width: layout.panelWidth,
              maxWidth: '100%',
              ...(alignRight ? { right: 0 } : { left: 0 }),
            },
          ]}
          pointerEvents="box-none">
          <Animated.View
            style={[
              {
                height: openPanelHeight,
                width: layout.panelWidth,
                maxWidth: '100%',
                transformOrigin: diagonalOffset.transformOrigin,
              },
              panelStyle,
            ]}
            pointerEvents={panelInteractive ? 'auto' : 'none'}>
            <AppChatWidgetPanel
              config={paint.config}
              customization={paint.displayCustomization}
              onClose={close}
              keyboardInset={keyboardInset}
              layoutSize={panelLayoutSize}
            />
          </Animated.View>
        </View>
      )}

      {useModalShell ? (
        <LauncherAnchor
          bottom={openInner.bottom}
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

      {panelMounted && !useModalShell && (isOpen || isPanelAnimating) ? (
        <View style={styles.passThroughRoot} pointerEvents="box-none">
          {openPanel}
        </View>
      ) : null}

      {/* Backdrop-OFF: one continuous launcher (open+close morph) — no remount hitch. */}
      {!useModalShell ? (
        <LauncherAnchor
          bottom={panelInteractive ? openInner.bottom : closedInner.bottom}
          showBubble={!panelInteractive && showBubble}
          measureRef={closedLauncherRef}
          onMeasureLayout={reportClosedLauncherSize}
          {...launcherProps}
          sideInset={panelInteractive ? openInner.side : closedInner.side}
          isOpen={isOpen}
        />
      ) : null}

      {/* Backdrop-ON: closed launcher after Modal dismiss (measure + bubble). */}
      {useModalShell && !modalVisible && launcherHandoffReady ? (
        <LauncherAnchor
          bottom={closedInner.bottom}
          showBubble={showBubble}
          measureRef={closedLauncherRef}
          onMeasureLayout={reportClosedLauncherSize}
          {...launcherProps}
          sideInset={closedInner.side}
          isOpen={false}
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
  cornerPanelPin: {
    position: 'absolute',
    zIndex: 2,
    elevation: 2,
  },
  launcherAnchor: {
    position: 'absolute',
    zIndex: 3,
    elevation: 3,
    pointerEvents: 'box-none',
  },
});
