import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppScrollView, type AppScrollViewRef } from '@/shared/components/app-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppChatWidgetMessage } from '@/features/app-chat-widget/components/AppChatWidgetMessage';
import { AppChatWidgetTypingIndicator } from '@/features/app-chat-widget/components/AppChatWidgetTypingIndicator';
import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import {
    gradientPoints,
    WidgetAvatarIcon,
} from '@/features/app-chat-widget/utils/app-chat-widget-display';
import { useAppChatWidgetLayout } from '@/features/app-chat-widget/utils/app-chat-widget-layout';
import { resolveAppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { isWelcomeMessage } from '@/features/app-chat-widget/utils/app-chat-widget-welcome';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import {
    isCustomGradientWidgetColor,
    isDefaultGradientWidgetColor,
    resolvePreviewGradient,
    resolveWidgetChatbotColor,
} from '@/features/chatbot-config/utils/widget-theme-utils';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { ActionIcons } from '@/shared/constants/action-icons';
import { ExtensionSlot } from '@/platform/extension-slots';

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  onClose: () => void;
  previewMode?: boolean;
  previewFeedbackEnabled?: boolean;
  previewHeight?: number;
  keyboardInset?: number;
};

const WELCOME_AVATAR_SIZE = 80;

export function AppChatWidgetPanel({
  config,
  customization,
  onClose,
  previewMode = false,
  previewFeedbackEnabled = true,
  previewHeight,
  keyboardInset = 0,
}: Props) {
  const { t } = useTranslation();
  const { radius } = useAppTheme();
  const insets = useSafeAreaInsets();
  const widgetContext = useAppChatWidget();
  const {
    messages,
    sending,
    isTyping,
    isStreaming,
    streamingContent,
    streamSlow,
    draft,
    setDraft,
    sendMessage,
    clearConversation,
    messageFeedback,
    settingsLoading,
    historyLoading,
    collectFeedback,
    feedbackDraft,
    feedbackSubmitting,
    openMessageFeedback,
    closeMessageFeedback,
    submitMessageFeedback,
    isOpen,
  } = widgetContext;
  const { panelWidth, panelHeight, isMobileLayout } = useAppChatWidgetLayout(
    insets,
    customization,
    { reserveLauncherSpace: previewMode || !isOpen },
  );
  const scrollRef = useRef<AppScrollViewRef>(null);
  /** One jump-to-latest per open; mid-session reading must not be yanked downward. */
  const didScrollOnOpenRef = useRef(false);
  /** When false, user scrolled up to read — never force scroll-down until they send or reopen. */
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const NEAR_BOTTOM_PX = 96;

  const scrollToBottom = (animated: boolean) => {
    scrollRef.current?.scrollToEnd({ animated });
  };
  /** Follow live reply only while sending/streaming AND the user is still at the bottom. */
  const shouldFollowLiveReply =
    !previewMode && isOpen && pinnedToBottom && (isTyping || isStreaming || sending);

  useEffect(() => {
    if (previewMode) return;
    if (!isOpen) {
      didScrollOnOpenRef.current = false;
      setPinnedToBottom(true);
    }
  }, [isOpen, previewMode]);

  useEffect(() => {
    if (previewMode || !isOpen || didScrollOnOpenRef.current) return;
    if (historyLoading || settingsLoading) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tryScrollToLatest = () => {
      if (cancelled) return;
      attempts += 1;
      if (!scrollRef.current) {
        if (attempts < maxAttempts) requestAnimationFrame(tryScrollToLatest);
        return;
      }
      didScrollOnOpenRef.current = true;
      setPinnedToBottom(true);
      scrollToBottom(false);
    };

    requestAnimationFrame(tryScrollToLatest);
    return () => {
      cancelled = true;
    };
  }, [isOpen, previewMode, historyLoading, settingsLoading]);

  useEffect(() => {
    if (!shouldFollowLiveReply) return;
    // Instant while streaming tokens arrive; smooth otherwise.
    scrollToBottom(!(isStreaming && streamingContent));
  }, [shouldFollowLiveReply, isStreaming, streamingContent, isTyping, sending, messages]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    setPinnedToBottom((prev) => (prev === nearBottom ? prev : nearBottom));
  };

  const theme = useMemo(() => resolveAppChatWidgetTheme(config, customization), [config, customization]);
  const widgetChatbotColor = resolveWidgetChatbotColor(customization.primaryColor);
  const useGradientHeader =
    isDefaultGradientWidgetColor(widgetChatbotColor) || isCustomGradientWidgetColor(widgetChatbotColor);
  const previewGradient = useMemo(
    () =>
      resolvePreviewGradient(
        widgetChatbotColor,
        customization.primaryColor,
        customization.secondaryColor,
        customization.gradientAngle,
      ),
    [customization.gradientAngle, customization.primaryColor, customization.secondaryColor, widgetChatbotColor],
  );
  const gradient = useMemo(() => gradientPoints(previewGradient.angle), [previewGradient.angle]);
  const gradientColors = useMemo(
    () => [previewGradient.color1, previewGradient.color2] as const,
    [previewGradient.color1, previewGradient.color2],
  );
  const welcomeText = config.welcomeMessage || config.greeting || t('chatbot.config.defaultWelcomeMessage');
  const headerTitle = config.title || config.launcherLabel || t('chatbot.config.defaultTitle');
  const panelRadius = Math.max(0, Math.min(28, customization.panelBorderRadius ?? 20));
  const messageFontSize = customization.fontSize || 14;
  const feedbackEnabled = previewMode ? previewFeedbackEnabled : collectFeedback;
  const isLoading = !previewMode && (settingsLoading || historyLoading);
  const canSend = !previewMode && !sending;
  const hasDraft = Boolean(draft.trim());
  const sendDisabled = previewMode || !hasDraft || sending;
  const sendIconColor = sendDisabled ? theme.sendIconColor : theme.sendIconActiveColor;
  const sendOpacity = sendDisabled ? theme.sendIconDisabledOpacity : 1;
  const resolvedPanelHeight = previewMode
    ? Math.max(280, (previewHeight ?? panelHeight) - (keyboardInset > 0 ? keyboardInset : 0))
    : panelHeight;
  /** Host owns keyboard inset for the live modal on every platform (visualViewport on web). */
  const hostOwnsKeyboard = !previewMode;
  /** Side inset scales lightly with panel width from customization / layout. */
  const messageGutter = Math.max(6, Math.min(10, Math.round(panelWidth * 0.02)));

  const submitDraft = () => {
    if (!canSend || !hasDraft) return;
    setPinnedToBottom(true);
    void sendMessage();
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const headerIconStyle = ({
    pressed,
    hovered,
  }: {
    pressed: boolean;
    hovered?: boolean;
  }) => {
    const active = pressed || Boolean(hovered);
    return [
      styles.headerIconBtn,
      {
        backgroundColor: active ? 'rgba(255,255,255,0.16)' : 'transparent',
        opacity: active ? 1 : 0.88,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      },
    ];
  };

  const header = (
    <View style={[styles.headerRow, { paddingHorizontal: 15, paddingVertical: 12 }]}>
      {customization.showLogo && customization.logoUrl ? (
        <Image source={{ uri: customization.logoUrl }} style={[styles.headerLogo, { borderRadius: radius.pill }]} contentFit="cover" />
      ) : null}
      <Text style={[styles.headerTitle, { color: theme.headerTextColor }]} numberOfLines={1}>
        {headerTitle}
      </Text>
      <View style={styles.headerActions}>
        {!previewMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.clearConversation.a11y')}
            onPress={() => void clearConversation()}
            style={headerIconStyle}>
            <ActionIcons.delete size={20} color={theme.headerTextColor} />
          </Pressable>
        ) : (
          <View style={styles.headerIconBtn}>
            <ActionIcons.delete size={20} color={theme.headerTextColor} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.widget.app.closeChat.a11y')}
          onPress={previewMode ? undefined : onClose}
          disabled={previewMode}
          style={headerIconStyle}>
          <X size={24} color={theme.headerTextColor} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <AppKeyboardAvoiding
      surface="modal"
      enabled={!hostOwnsKeyboard}
      style={[
        styles.panelWrap,
        {
          width: panelWidth,
          maxWidth: '100%',
          height: resolvedPanelHeight,
          overflow: 'hidden',
        },
      ]}>
      <View
        style={[
          styles.panel,
          {
            borderRadius: panelRadius,
            backgroundColor: theme.panelBg,
            borderColor: theme.panelBorderColor,
            overflow: 'hidden',
            flex: 1,
          },
        ]}>
        {useGradientHeader ? (
          <LinearGradient
            colors={[...gradientColors]}
            start={gradient.start}
            end={gradient.end}
            style={[
              styles.headerGradient,
              { borderTopLeftRadius: panelRadius, borderTopRightRadius: panelRadius },
            ]}>
            {header}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.headerSolid,
              {
                backgroundColor: customization.headerColor || widgetChatbotColor || theme.accentColor,
                borderTopLeftRadius: panelRadius,
                borderTopRightRadius: panelRadius,
              },
            ]}>
            {header}
          </View>
        )}

        <AppScrollView
          ref={scrollRef}
          scrollbarVariant="overlay"
          keyboardShouldPersistTaps="always"
          automaticallyAdjustKeyboardInsets={false}
          style={[styles.bodyScroll, { backgroundColor: theme.panelBg }]}
          contentContainerStyle={[styles.bodyContent, { paddingHorizontal: messageGutter }]}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onContentSizeChange={() => {
            if (!shouldFollowLiveReply) return;
            scrollToBottom(!(isStreaming && streamingContent));
          }}>
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.accentColor} />
            </View>
          ) : null}

          <View style={styles.heroWrap}>
            <View
              style={[
                styles.heroAvatar,
                {
                  width: WELCOME_AVATAR_SIZE,
                  height: WELCOME_AVATAR_SIZE,
                  borderRadius: WELCOME_AVATAR_SIZE / 2,
                  backgroundColor: theme.avatarBg,
                },
              ]}>
              <WidgetAvatarIcon
                avatarId={customization.avatarId}
                avatarUrl={customization.avatarUrl}
                size={WELCOME_AVATAR_SIZE}
                color={theme.accentColor}
              />
            </View>
            <Text style={[styles.heroTitle, { color: theme.heroTitleColor }]}>{headerTitle}</Text>
            <Text style={[styles.heroSubtitle, { color: theme.heroSubtitleColor, fontSize: customization.fontSize }]}>
              {welcomeText}
            </Text>
          </View>

        {messages.map((message) => (
          <AppChatWidgetMessage
            key={message.id}
            message={message}
            customization={customization}
            theme={theme}
            fontSize={messageFontSize}
            showDateTime={customization.showDateTime}
            collectFeedback={feedbackEnabled && !isWelcomeMessage(message)}
            feedback={previewMode ? null : (messageFeedback[message.id] ?? null)}
            feedbackOpen={!previewMode && feedbackDraft?.messageId === message.id}
            feedbackSentiment={feedbackDraft?.sentiment}
            feedbackSubmitting={feedbackSubmitting}
            language={config.language}
            onFeedbackPress={
              previewMode ? undefined : (sentiment) => openMessageFeedback(message.id, sentiment)
            }
            onFeedbackCancel={closeMessageFeedback}
            onFeedbackSubmit={(payload) => void submitMessageFeedback(payload)}
          />
        ))}

        {!previewMode && isTyping ? (
          <View style={styles.assistantRow}>
            <View
              style={[
                styles.miniAvatar,
                {
                  backgroundColor: customization.avatarUrl?.trim() ? 'transparent' : theme.avatarBg,
                },
              ]}>
              <WidgetAvatarIcon
                avatarId={customization.avatarId}
                avatarUrl={customization.avatarUrl}
                size={30}
                color={theme.accentColor}
              />
            </View>
            <View
              style={[
                styles.assistantBubble,
                {
                  backgroundColor: theme.assistantBubbleBg,
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: Math.max(12, Math.min(customization.bubbleRadius || 12, 18)),
                  borderBottomLeftRadius: Math.max(12, Math.min(customization.bubbleRadius || 12, 18)),
                  borderBottomRightRadius: Math.max(12, Math.min(customization.bubbleRadius || 12, 18)),
                },
              ]}>
              {streamSlow ? (
                <Text style={{ color: theme.assistantTextColor, fontSize: messageFontSize, opacity: 0.85 }}>
                  Still thinking…
                </Text>
              ) : (
                <AppChatWidgetTypingIndicator color={theme.assistantTextColor} />
              )}
            </View>
          </View>
        ) : null}

        {!previewMode && isStreaming && streamingContent ? (
          <AppChatWidgetMessage
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              createdAt: new Date().toISOString(),
              streaming: true,
            }}
            customization={customization}
            theme={theme}
            fontSize={messageFontSize}
            showDateTime={false}
            collectFeedback={false}
            language={config.language}
          />
        ) : null}
      </AppScrollView>

        <View style={[styles.inputSection, { backgroundColor: theme.inputSectionBg, borderTopColor: theme.inputBorderColor }]}>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel={t('chatbot.widget.app.messageInput.a11y')}
              placeholder={config.placeholder || t('chatbot.widget.app.messagePlaceholder')}
              placeholderTextColor={theme.placeholderColor}
              value={previewMode ? '' : draft}
              editable={canSend}
              onChangeText={setDraft}
              onSubmitEditing={submitDraft}
              returnKeyType="send"
              multiline={Platform.OS !== 'web'}
              blurOnSubmit={Platform.OS === 'web'}
              style={[
                getInputTextStyle({ fontSize: customization.fontSize }, { multiline: true, includeHorizontalPadding: false }),
                styles.input,
                {
                  color: theme.inputTextColor,
                  fontSize: customization.fontSize,
                  maxHeight: isMobileLayout ? 96 : 120,
                },
              ]}
            />
            <ExtensionSlot
              name="chat.composer.trailing"
              value={previewMode ? '' : draft}
              onChangeText={setDraft}
              onVoiceCommitted={(text) => {
                const trimmed = text.trim();
                if (!trimmed || previewMode || sending) return;
                setDraft(trimmed);
                queueMicrotask(() => {
                  setPinnedToBottom(true);
                  void sendMessage(trimmed);
                  requestAnimationFrame(() => scrollToBottom(true));
                });
              }}
              disabled={!canSend}
              previewMode={previewMode}
              language={config.language}
              iconColor={theme.sendIconColor}
              activeColor={theme.sendIconActiveColor}
              surface="chat"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chatbot.widget.app.sendMessage.a11y')}
              disabled={sendDisabled}
              onPress={submitDraft}
              style={[
                styles.sendBtn,
                {
                  opacity: sendOpacity,
                  borderLeftColor: theme.sendBorderColor,
                },
              ]}>
              {sending ? (
                <ActivityIndicator color={theme.sendIconActiveColor} size="small" />
              ) : (
                <Send size={24} color={sendIconColor} />
              )}
            </Pressable>
          </View>
          <Text style={[styles.disclaimer, { color: theme.disclaimerColor }]}>
            {t('chatbot.widget.app.disclaimer')}
          </Text>
        </View>
      </View>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  panelWrap: {
    position: 'relative',
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
  },
  headerGradient: {},
  headerSolid: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    flex: 1,
    fontWeight: '500',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: Platform.OS !== 'web' ? 4 : 8,
    paddingBottom: 8,
    gap: 0,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  heroWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  heroAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontWeight: '500',
    fontSize: 16,
    textAlign: 'center',
  },
  heroSubtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  inputSection: {
    borderTopWidth: 1,
    paddingBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: TOUCH_TARGET_MIN,
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    paddingRight: 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null),
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingTop: 4,
    opacity: 0.72,
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    paddingVertical: 10,
  },
  miniAvatar: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    flexShrink: 0,
  },
  assistantBubble: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    maxWidth: Platform.OS !== 'web' ? '90%' : undefined,
    overflow: 'hidden',
  },
});
