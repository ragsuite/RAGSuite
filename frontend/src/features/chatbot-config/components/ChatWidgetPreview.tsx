import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppChatWidgetBubbleHint } from '@/features/app-chat-widget/components/AppChatWidgetBubbleHint';
import { AppChatWidgetLauncher } from '@/features/app-chat-widget/components/AppChatWidgetLauncher';
import { AppChatWidgetPanel } from '@/features/app-chat-widget/components/AppChatWidgetPanel';
import { useChatWidgetBubbleHintVisibility } from '@/features/app-chat-widget/hooks/use-chat-widget-bubble-hint-visibility';
import { AppChatWidgetPreviewProvider } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { resolveChatPanelDiagonalOffset, resolveChatPanelOpacity } from '@/features/app-chat-widget/utils/chat-panel-diagonal-motion';
import { resolveAppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import {
  PREVIEW_BOTTOM_GUTTER,
  PREVIEW_STICKY_TOP,
} from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { AvatarOption, ChatWidgetConfig, ChatWidgetCustomization, FaqSettings, PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { withResolvedWidgetAvatarCustomization } from '@/features/chatbot-config/utils/widget-avatar-display';
import { useTranslation } from '@/i18n';
import { ComponentErrorBoundary } from '@/shared/components/error/component-error-boundary';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

const PREVIEW_PREFERRED_WIDE = 650;
const PREVIEW_PREFERRED_COMPACT = 420;
const PREVIEW_STAGE_FLOOR = 280;
const PREVIEW_PANEL_FLOOR = 240;
/** Fallback when header has not measured yet (title + subtitle + padding). */
const PREVIEW_CHROME_FALLBACK = 108;
const DEFAULT_PANEL_WIDTH = 400;
const PANEL_LAUNCHER_GAP = 12;
/** Match Host/Embed panel motion curves. */
const PANEL_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PANEL_EXIT_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  avatarOptions?: AvatarOption[];
  feedbackEnabled?: boolean;
  faqSettings?: FaqSettings | null;
  privacyNoticeSettings?: PrivacyNoticeSettings | null;
  accessibilityLabel?: string;
};

function resolvePanelWidth(customization: ChatWidgetCustomization) {
  if (customization.customWidthEnabled) {
    return Math.min(Math.max(customization.widgetWidth, 320), 900);
  }
  return DEFAULT_PANEL_WIDTH;
}

function resolvePreviewPanelHeight(customization: ChatWidgetCustomization, panelMaxHeight: number) {
  if (customization.customHeightEnabled) {
    return Math.min(Math.max(customization.widgetHeight, 360), 800, panelMaxHeight);
  }
  return Math.min(600, panelMaxHeight);
}

export function ChatWidgetPreview({
  config,
  customization,
  avatarOptions,
  feedbackEnabled = true,
  faqSettings = null,
  privacyNoticeSettings = null,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { isCompact } = useChatbotConfigLayout();
  const { height: windowHeight } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(true);
  const [panelMounted, setPanelMounted] = useState(true);
  const [isPanelAnimating, setIsPanelAnimating] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);
  const [chromeHeight, setChromeHeight] = useState(0);
  const openProgress = useSharedValue(1);
  const closingSv = useSharedValue(0);
  const showBubble = useChatWidgetBubbleHintVisibility(config.bubbleMessage, isOpen);
  const panelInteractive = isOpen || isPanelAnimating;

  const preferredStageHeight = isCompact ? PREVIEW_PREFERRED_COMPACT : PREVIEW_PREFERRED_WIDE;
  const stickyBudget = Math.max(320, windowHeight - PREVIEW_STICKY_TOP - PREVIEW_BOTTOM_GUTTER);
  const cardMaxHeight = isCompact ? undefined : stickyBudget;
  const measuredChrome = chromeHeight > 0 ? chromeHeight : PREVIEW_CHROME_FALLBACK;
  /** Card vertical padding + gap above the stage (outside measured chrome). */
  const wrapVerticalExtra = spacing.md * 2 + spacing.sm;
  const availableStageHeight = isCompact
    ? preferredStageHeight
    : stickyBudget - measuredChrome - wrapVerticalExtra;
  const previewStageHeight = Math.min(
    preferredStageHeight,
    Math.max(PREVIEW_STAGE_FLOOR, availableStageHeight),
  );

  const configuredPanelWidth = resolvePanelWidth(customization);
  const launcherSize = customization.avatarSize || 38;
  const alignRight = config.position !== 'bottom-left';
  const stagePad = spacing.md * 2;
  const previewContentHeight = Math.max(PREVIEW_STAGE_FLOOR - stagePad, previewStageHeight - stagePad);
  const bubbleReserve = config.bubbleMessage?.trim() ? 48 : 0;
  const stackReserve =
    launcherSize + PANEL_LAUNCHER_GAP + customization.widgetBottomSpace + bubbleReserve;
  const panelMaxHeight = Math.max(PREVIEW_PANEL_FLOOR, previewContentHeight - stackReserve);
  /** Fit by layout width (no CSS scale) so Layout 1 + Layout 2 keep reference proportions. */
  const panelWidth =
    stageWidth > 0 ? Math.min(configuredPanelWidth, stageWidth) : configuredPanelWidth;
  const isFitted = stageWidth > 0 && panelWidth < configuredPanelWidth - 0.5;
  const previewTheme = useMemo(
    () => resolveAppChatWidgetTheme(config, customization),
    [config, customization],
  );
  const displayCustomization = useMemo(
    () => withResolvedWidgetAvatarCustomization(customization, avatarOptions),
    [avatarOptions, customization],
  );
  const previewPanelHeight = Math.min(
    resolvePreviewPanelHeight(displayCustomization, panelMaxHeight),
    panelMaxHeight,
  );

  const previewConfig = useMemo(
    () => ({
      ...config,
      showLauncher: true,
    }),
    [config],
  );

  const diagonalOffset = resolveChatPanelDiagonalOffset({
    position: config.position ?? 'bottom-right',
    launcherSize,
  });

  const finalizeClose = useCallback(() => {
    setIsPanelAnimating(false);
    setPanelMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPanelMounted(true);
      setIsPanelAnimating(true);
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

    if (!panelMounted) return;

    setIsPanelAnimating(true);
    closingSv.value = 1;
    openProgress.value = withTiming(
      0,
      {
        duration: reducedMotion ? 0 : motion.chatPanelExit,
        easing: PANEL_EXIT_EASE,
      },
      (finished) => {
        if (finished) runOnJS(finalizeClose)();
      },
    );
  }, [closingSv, finalizeClose, isOpen, openProgress, panelMounted, reducedMotion]);

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

  const onStageLayout = (event: LayoutChangeEvent) => {
    setStageWidth(event.nativeEvent.layout.width);
  };

  const onChromeLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setChromeHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? t('chatbot.widget.preview.a11y')}
      style={[
        styles.wrap,
        elevation.card,
        {
          padding: spacing.md,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: panelRadius,
          ...(cardMaxHeight != null ? { maxHeight: cardMaxHeight } : null),
        },
      ]}>
      <View onLayout={onChromeLayout} style={styles.chrome}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headingSemibold, { color: colors.text }]}>
              {t('chatbot.widget.preview.title')}
            </Text>
            <Text style={[typography.body, { color: colors.textMuted, lineHeight: 20 }]}>
              {isFitted
                ? t('chatbot.widget.preview.subtitleScaled', { count: Math.round(configuredPanelWidth) })
                : t('chatbot.widget.preview.subtitleInteractive')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsOpen((open) => !open)}
            style={[styles.toggleBtn, { borderColor: colors.border, borderRadius: controlRadius }]}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
              {isOpen ? t('chatbot.widget.preview.close') : t('chatbot.widget.preview.open')}
            </Text>
          </Pressable>
        </View>

        {customization.customWidthEnabled ? (
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
            {t('chatbot.widget.preview.onSiteWidth', { count: customization.widgetWidth })}
          </Text>
        ) : null}
      </View>

      <View
        onLayout={onStageLayout}
        style={[
          styles.stage,
          {
            marginTop: spacing.sm,
            height: previewStageHeight,
            padding: spacing.md,
            borderRadius: controlRadius,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}>
        <AppChatWidgetPreviewProvider
          config={previewConfig}
          customization={displayCustomization}
          collectFeedback={feedbackEnabled}
          faqSettings={faqSettings ?? undefined}
          privacyNoticeSettings={privacyNoticeSettings ?? undefined}
          avatarOptions={avatarOptions}>
          <ComponentErrorBoundary componentName="ChatWidgetPreview">
            {/* Fit panel + launcher in the stage — no nested scroll to hunt. */}
            <View
              style={[
                styles.stageInner,
                {
                  height: previewContentHeight,
                  paddingBottom: customization.widgetBottomSpace,
                  alignItems: alignRight ? 'flex-end' : 'flex-start',
                },
              ]}>
              <View
                style={{
                  width: panelWidth,
                  maxWidth: '100%',
                }}>
                {panelMounted ? (
                  <Animated.View
                    pointerEvents={panelInteractive ? 'auto' : 'none'}
                    style={[
                      {
                        marginBottom: PANEL_LAUNCHER_GAP,
                        maxHeight: panelMaxHeight,
                        width: panelWidth,
                        maxWidth: '100%',
                        height: previewPanelHeight,
                        transformOrigin: diagonalOffset.transformOrigin,
                      },
                      panelStyle,
                    ]}>
                    <AppChatWidgetPanel
                      config={previewConfig}
                      customization={displayCustomization}
                      onClose={() => setIsOpen(false)}
                      previewMode
                      previewFeedbackEnabled={feedbackEnabled}
                      previewHeight={previewPanelHeight}
                      layoutSize={{ width: panelWidth, height: previewPanelHeight }}
                    />
                  </Animated.View>
                ) : null}

                <View
                  style={{
                    marginTop: panelMounted ? 0 : PANEL_LAUNCHER_GAP,
                    alignItems: alignRight ? 'flex-end' : 'flex-start',
                  }}>
                  {config.bubbleMessage?.trim() ? (
                    <AppChatWidgetBubbleHint
                      message={config.bubbleMessage}
                      backgroundColor={previewTheme.panelBg}
                      textColor={previewTheme.heroTitleColor}
                      borderColor={previewTheme.panelBorderColor}
                      visible={showBubble}
                      onPress={() => setIsOpen(true)}
                    />
                  ) : null}
                  <AppChatWidgetLauncher
                    config={previewConfig}
                    customization={displayCustomization}
                    isOpen={isOpen}
                    onPress={() => setIsOpen((open) => !open)}
                  />
                </View>
              </View>
            </View>
          </ComponentErrorBoundary>
        </AppChatWidgetPreviewProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1 },
  chrome: { width: '100%' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  toggleBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stage: { width: '100%', overflow: 'hidden' },
  stageInner: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
});
