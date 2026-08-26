import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, Send, X } from 'lucide-react-native';
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
import {
  isChatMessageLongEnough,
} from '@/features/app-chat-widget/utils/app-chat-widget-validation';
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
import { brandTokens } from '@/theme/brand-tokens';

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  onClose: () => void;
  previewMode?: boolean;
  previewFeedbackEnabled?: boolean;
  previewHeight?: number;
  keyboardInset?: number;
  /**
   * Embed host-viewport box. When set, ignore iframe window metrics so the panel
   * matches the wrapper (avoids mobile-breakpoint shrink inside a tight corner iframe).
   */
  layoutSize?: { width: number; height: number };
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
  layoutSize,
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
    scrollOffsetYRef,
  } = widgetContext;
  const layout = useAppChatWidgetLayout(insets, customization, { reserveLauncherSpace: true });
  const panelWidth = layoutSize?.width ?? layout.panelWidth;
  const panelHeight = layoutSize?.height ?? layout.panelHeight;
  const scrollRef = useRef<AppScrollViewRef>(null);
  const didRestoreScrollRef = useRef(false);
  /** When false, user scrolled up to read — never force scroll-down until they send. */
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
    didRestoreScrollRef.current = false;
  }, [previewMode, isOpen]);

  useEffect(() => {
    if (!shouldFollowLiveReply) return;
    // Instant while streaming tokens arrive; smooth otherwise.
    scrollToBottom(!(isStreaming && streamingContent));
  }, [shouldFollowLiveReply, isStreaming, streamingContent, isTyping, sending, messages]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollOffsetYRef.current = contentOffset.y;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    setPinnedToBottom((prev) => (prev === nearBottom ? prev : nearBottom));
  };

  const restoreScrollIfNeeded = () => {
    if (previewMode || didRestoreScrollRef.current) return;
    const y = scrollOffsetYRef.current;
    if (!(y > 0)) {
      didRestoreScrollRef.current = true;
      return;
    }
    didRestoreScrollRef.current = true;
    scrollRef.current?.scrollTo({ y, animated: false });
  };

  const jumpToLatest = () => {
    setPinnedToBottom(true);
    scrollToBottom(true);
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
  const trimmedDraft = draft.trim();
  const hasDraft = Boolean(trimmedDraft);
  const draftLongEnough = isChatMessageLongEnough(draft);
  const showMinLengthError = !previewMode && hasDraft && !draftLongEnough;
  const sendDisabled = previewMode || !draftLongEnough || sending;
  const sendIconColor = sendDisabled ? theme.sendIconColor : theme.sendIconActiveColor;
  const sendOpacity = sendDisabled ? theme.sendIconDisabledOpacity : 1;
  // Scrollbar only after Shift+Enter (or any explicit newline) — not on empty/single-line.
  const composerHasMultipleLines = !previewMode && draft.includes('\n');
  const resolvedPanelHeight = previewMode
    ? Math.max(280, (previewHeight ?? panelHeight) - (keyboardInset > 0 ? keyboardInset : 0))
    : panelHeight;
  /** Host owns keyboard inset for the live modal on every platform (visualViewport on web). */
  const hostOwnsKeyboard = !previewMode;
  /** Side inset scales lightly with panel width from customization / layout. */
  const messageGutter = Math.max(6, Math.min(10, Math.round(panelWidth * 0.02)));

  const submitDraft = () => {
    if (!canSend || !draftLongEnough) return;
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

        <View style={styles.bodyWrap}>
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
            restoreScrollIfNeeded();
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
      </AppScrollView>

        {!previewMode && !pinnedToBottom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.scrollToLatest.a11y')}
            hitSlop={8}
            onPress={jumpToLatest}
            style={({ pressed, hovered }) => [
              styles.scrollLatestBtn,
              {
                backgroundColor: brandTokens.color.paperRaised,
                borderColor: brandTokens.color.hairlineStrong,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : hovered ? 1.04 : 1 }],
              },
            ]}>
            <ChevronDown size={14} color={brandTokens.color.inkSoft} strokeWidth={2} />
          </Pressable>
        ) : null}
        </View>

        <View style={[styles.inputSection, { backgroundColor: theme.inputSectionBg, borderTopColor: theme.inputBorderColor }]}>
          <View
            style={[
              styles.queryShell,
              {
                borderColor: theme.inputBorderColor,
                backgroundColor: theme.inputSectionBg,
              },
            ]}>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel={t('chatbot.widget.app.messageInput.a11y')}
                placeholder={config.placeholder || t('chatbot.widget.app.messagePlaceholder')}
                placeholderTextColor={theme.placeholderColor}
                value={previewMode ? '' : draft}
                editable={canSend}
                onChangeText={setDraft}
                multiline
                // RN Web multiline only routes Enter→onSubmitEditing when blurOnSubmit is true
                // (it overwrites any custom onKeyDown). Shift+Enter still inserts a newline.
                blurOnSubmit={Platform.OS === 'web'}
                scrollEnabled={composerHasMultipleLines}
                returnKeyType="send"
                onSubmitEditing={submitDraft}
                style={[
                  getInputTextStyle(
                    { fontSize: customization.fontSize },
                    { multiline: true, includeHorizontalPadding: false },
                  ),
                  styles.input,
                  {
                    color: theme.inputTextColor,
                    fontSize: customization.fontSize,
                    // Keep line box inside fixed chrome so empty/1-line never overflows.
                    lineHeight: Math.min(
                      Math.round(customization.fontSize * 1.35),
                      TOUCH_TARGET_MIN - 8,
                    ),
                    // Fixed single-row chrome — overflow scrolls only after a newline.
                    height: TOUCH_TARGET_MIN,
                    maxHeight: TOUCH_TARGET_MIN,
                    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null),
                    ...(Platform.OS === 'web'
                      ? ({
                          // `scroll` (not `auto`): bar shows as soon as there is a newline,
                          // even when two short lines still fit inside the fixed 44px box.
                          overflowY: composerHasMultipleLines ? 'scroll' : 'hidden',
                          resize: 'none',
                        } as object)
                      : null),
                  },
                ]}
              />
              {customization.showSpeechInput !== false ? (
              <ExtensionSlot
                name="chat.composer.trailing"
                value={previewMode ? '' : draft}
                onChangeText={setDraft}
                onVoiceCommitted={(text) => {
                  const trimmed = text.trim();
                  if (!trimmed || previewMode || sending) return;
                  setDraft(trimmed);
                  if (!isChatMessageLongEnough(trimmed)) return;
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
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chatbot.widget.app.sendMessage.a11y')}
                disabled={sendDisabled}
                onPress={submitDraft}
                style={({ pressed, hovered }) => {
                  const active = !sendDisabled && (hovered || pressed);
                  const iconColor = theme.sendIconColor;
                  return [
                    styles.sendBtn,
                    {
                      opacity: sendDisabled ? sendOpacity : pressed ? 0.85 : sendOpacity,
                      borderColor: active ? `${iconColor}44` : 'transparent',
                      backgroundColor: active ? `${iconColor}11` : 'transparent',
                      ...(Platform.OS === 'web'
                        ? ({
                            cursor: sendDisabled ? 'default' : 'pointer',
                            transitionProperty: 'background-color, border-color, opacity',
                            transitionDuration: '160ms',
                          } as object)
                        : null),
                    },
                  ];
                }}>
                {sending ? (
                  <ActivityIndicator color={theme.sendIconActiveColor} size="small" />
                ) : (
                  <Send size={24} color={sendIconColor} />
                )}
              </Pressable>
            </View>
          </View>
          {showMinLengthError ? (
            <Text style={[styles.minLengthHint, { color: theme.assistantErrorText ?? theme.metaColor }]}>
              {t('chatbot.widget.app.validation.minChars')}
            </Text>
          ) : null}
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
  bodyWrap: {
    flex: 1,
    position: 'relative',
  },
  scrollLatestBtn: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    elevation: 4,
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
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 6,
  },
  queryShell: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
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
    borderWidth: 1,
    borderRadius: 8,
    marginRight: 4,
    marginBottom: 0,
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingTop: 2,
    opacity: 0.72,
  },
  minLengthHint: {
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: 12,
    paddingTop: 4,
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
