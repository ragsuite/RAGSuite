import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChatWidgetBubbleHint } from '@/features/app-chat-widget/components/AppChatWidgetBubbleHint';
import { AppChatWidgetLauncher } from '@/features/app-chat-widget/components/AppChatWidgetLauncher';
import { AppChatWidgetPanel } from '@/features/app-chat-widget/components/AppChatWidgetPanel';
import { AppChatWidgetPreviewProvider } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { resolveAppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { AvatarOption, ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { withResolvedWidgetAvatarCustomization } from '@/features/chatbot-config/utils/widget-avatar-display';
import { useTranslation } from '@/i18n';
import { ComponentErrorBoundary } from '@/shared/components/error/component-error-boundary';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const PREVIEW_MIN_HEIGHT_WIDE = 650;
const PREVIEW_MIN_HEIGHT_COMPACT = 420;
const DEFAULT_PANEL_WIDTH = 448;

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  avatarOptions?: AvatarOption[];
  feedbackEnabled?: boolean;
  accessibilityLabel?: string;
};

function resolvePanelWidth(customization: ChatWidgetCustomization) {
  if (customization.customWidthEnabled) {
    return Math.min(Math.max(customization.widgetWidth, 320), 900);
  }
  return DEFAULT_PANEL_WIDTH;
}

export function ChatWidgetPreview({
  config,
  customization,
  avatarOptions,
  feedbackEnabled = true,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { isCompact } = useChatbotConfigLayout();
  const [isOpen, setIsOpen] = useState(true);
  const [stageWidth, setStageWidth] = useState(0);

  const previewMinHeight = isCompact ? PREVIEW_MIN_HEIGHT_COMPACT : PREVIEW_MIN_HEIGHT_WIDE;
  const panelWidth = resolvePanelWidth(customization);
  const launcherSize = customization.avatarSize || 38;
  const alignRight = config.position !== 'bottom-left';
  const previewContentHeight = previewMinHeight - spacing.md * 2 - (customization.customWidthEnabled ? 24 : 0);
  const panelMaxHeight = previewContentHeight - launcherSize - 12 - customization.widgetBottomSpace;
  const scale = stageWidth > 0 && panelWidth > stageWidth ? stageWidth / panelWidth : 1;
  const isScaled = scale < 0.999;
  const previewTheme = useMemo(
    () => resolveAppChatWidgetTheme(config, customization),
    [config, customization],
  );
  const displayCustomization = useMemo(
    () => withResolvedWidgetAvatarCustomization(customization, avatarOptions),
    [avatarOptions, customization],
  );

  const previewConfig = useMemo(
    () => ({
      ...config,
      showLauncher: true,
    }),
    [config],
  );

  const onStageLayout = (event: LayoutChangeEvent) => {
    setStageWidth(event.nativeEvent.layout.width);
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
        },
      ]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.headingSemibold, { color: colors.text }]}>
            {t('chatbot.widget.preview.title')}
          </Text>
          <Text style={[typography.body, { color: colors.textMuted, lineHeight: 20 }]}>
            {isScaled
              ? t('chatbot.widget.preview.subtitleScaled', { count: Math.round(panelWidth) })
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

      <View
        onLayout={onStageLayout}
        style={[
          styles.stage,
          {
            marginTop: spacing.sm,
            minHeight: previewMinHeight,
            maxHeight: previewMinHeight,
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
          avatarOptions={avatarOptions}>
          <ComponentErrorBoundary componentName="ChatWidgetPreview">
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
                transform: [{ scale }],
                transformOrigin: alignRight ? 'bottom right' : 'bottom left',
              }}>
              {isOpen ? (
                <View style={{ maxHeight: panelMaxHeight, width: panelWidth, maxWidth: '100%' }}>
                  <AppChatWidgetPanel
                    config={previewConfig}
                    customization={displayCustomization}
                    onClose={() => setIsOpen(false)}
                    previewMode
                    previewFeedbackEnabled={feedbackEnabled}
                    previewHeight={Math.min(480, panelMaxHeight)}
                  />
                </View>
              ) : null}

              <View style={{ marginTop: 12, alignItems: alignRight ? 'flex-end' : 'flex-start' }}>
                {!isOpen && config.bubbleMessage?.trim() ? (
                  <AppChatWidgetBubbleHint
                    message={config.bubbleMessage}
                    backgroundColor={previewTheme.panelBg}
                    textColor={previewTheme.heroTitleColor}
                    borderColor={previewTheme.panelBorderColor}
                    visible
                    onPress={() => setIsOpen(true)}
                  />
                ) : null}
                <AppChatWidgetLauncher
                  config={previewConfig}
                  customization={displayCustomization}
                  onPress={() => setIsOpen(true)}
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
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
});
