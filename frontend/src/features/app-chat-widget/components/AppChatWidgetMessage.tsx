import { Check, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChatWidgetMarkdownBody } from '@/features/app-chat-widget/components/AppChatWidgetMarkdownBody';
import { AppChatWidgetInlineFeedback } from '@/features/app-chat-widget/components/AppChatWidgetInlineFeedback';
import { AppChatWidgetTypingIndicator } from '@/features/app-chat-widget/components/AppChatWidgetTypingIndicator';
import type { AppChatMessage } from '@/features/app-chat-widget/types/app-chat-widget.types';
import {
  formatWidgetRelativeTime,
  WidgetAvatarIcon,
} from '@/features/app-chat-widget/utils/app-chat-widget-display';
import type { AppChatWidgetFeedbackSentiment } from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import type { ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import type { FeedbackReasonKey } from '@/shared/constants/feedback-reason-keys';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { CitationCard } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { copyText } from '@/shared/utils/copy-text';
import { ActionIcons } from '@/shared/constants/action-icons';
import { ExtensionSlot } from '@/platform/extension-slots';
import { useSpeechHighlight } from '@/platform/speech-highlight';

const WELCOME_AVATAR_SIZE = 80;
const MESSAGE_LINE_HEIGHT = 24;
const IS_NATIVE = Platform.OS !== 'web';
const IS_WEB = Platform.OS === 'web';
const SOURCES_MAX_HEIGHT = 240;

type MetaActionChrome = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
};

function resolveMetaActionChrome(
  theme: AppChatWidgetTheme,
  {
    pressed,
    hovered,
    selected,
    disabled,
  }: {
    pressed: boolean;
    hovered: boolean;
    selected: boolean;
    disabled?: boolean;
  },
): MetaActionChrome {
  if (disabled) {
    return {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      iconColor: theme.metaColor,
    };
  }
  if (selected) {
    return {
      backgroundColor: theme.accentColor,
      borderColor: theme.accentColor,
      iconColor: theme.accentForegroundColor,
    };
  }
  if (pressed || hovered) {
    return {
      backgroundColor: theme.assistantBubbleBg,
      borderColor: theme.starColor,
      iconColor: theme.starColor,
    };
  }
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    iconColor: theme.metaColor,
  };
}

type MetaActionButtonProps = {
  label: string;
  theme: AppChatWidgetTheme;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: (iconColor: string) => React.ReactNode;
};

function MetaActionButton({
  label,
  theme,
  onPress,
  disabled = false,
  selected = false,
  children,
}: MetaActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const showTooltip = IS_WEB && hovered && !disabled;

  return (
    <View style={styles.metaBtnWrap}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.metaTooltip,
            {
              backgroundColor: theme.assistantBubbleBg,
              borderColor: theme.starColor,
            },
          ]}>
          <Text style={[styles.metaTooltipText, { color: theme.assistantTextColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed, hovered: webHovered }) => {
          const chrome = resolveMetaActionChrome(theme, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return [
            styles.metaBtn,
            {
              borderColor: chrome.borderColor,
              backgroundColor: chrome.backgroundColor,
              opacity: disabled ? 0.45 : 1,
              ...(IS_WEB
                ? ({
                    cursor: disabled ? 'default' : 'pointer',
                    transitionProperty: 'background-color, border-color',
                    transitionDuration: '150ms',
                  } as object)
                : null),
            },
          ];
        }}>
        {({ pressed, hovered: webHovered }) => {
          const chrome = resolveMetaActionChrome(theme, {
            pressed: Boolean(pressed),
            hovered: hovered || Boolean(webHovered),
            selected,
            disabled,
          });
          return children(chrome.iconColor);
        }}
      </Pressable>
    </View>
  );
}

function resolveBubbleRadius(customization: ChatWidgetCustomization): number {
  const radius = customization.bubbleRadius || 12;
  return Math.max(12, Math.min(radius, 18));
}

type Props = {
  message: AppChatMessage;
  customization: ChatWidgetCustomization;
  theme: AppChatWidgetTheme;
  fontSize: number;
  showDateTime: boolean;
  collectFeedback?: boolean;
  feedback?: 'up' | 'down' | null;
  feedbackOpen?: boolean;
  feedbackSentiment?: AppChatWidgetFeedbackSentiment;
  feedbackSubmitting?: boolean;
  onFeedbackPress?: (sentiment: AppChatWidgetFeedbackSentiment) => void;
  onFeedbackCancel?: () => void;
  onFeedbackSubmit?: (payload: {
    rating: number;
    reasons: FeedbackReasonKey[];
    comments: string;
  }) => void;
  /** Chatbot widget language for feedback UI copy. */
  language?: string | null;
  isWelcomeHero?: boolean;
};

function AssistantBody({
  content,
  fontSize,
  textColor,
  mutedColor,
  linkColor,
  codeBackgroundColor,
  streaming,
  showCursor,
  speechContentKey,
}: {
  content: string;
  fontSize: number;
  textColor: string;
  mutedColor: string;
  linkColor: string;
  codeBackgroundColor: string;
  streaming?: boolean;
  showCursor?: boolean;
  speechContentKey?: string;
}) {
  if (!content.trim()) return null;
  return (
    <AppChatWidgetMarkdownBody
      content={content}
      textColor={textColor}
      mutedColor={mutedColor}
      linkColor={linkColor}
      codeBackgroundColor={codeBackgroundColor}
      fontSize={fontSize}
      streaming={streaming}
      showCursor={showCursor}
      speechContentKey={speechContentKey}
    />
  );
}

export function AppChatWidgetMessage({
  message,
  customization,
  theme,
  fontSize,
  showDateTime,
  collectFeedback = true,
  feedback = null,
  feedbackOpen = false,
  feedbackSentiment = 'positive',
  feedbackSubmitting = false,
  onFeedbackPress,
  onFeedbackCancel,
  onFeedbackSubmit,
  language,
  isWelcomeHero = false,
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const messageContent =
    typeof message.content === 'string'
      ? message.content
      : message.content == null
        ? ''
        : String(message.content);
  const timeLabel = formatWidgetRelativeTime(message.createdAt, t);
  const showTyping = message.pending && !messageContent.trim();
  const showStreaming = Boolean(message.streaming && messageContent.trim());
  // Freeze TTS text against divergent final polish, but allow safe extensions
  // so finishStreamingSpeak can still speak the unread suffix.
  const { isActive: speechActive } = useSpeechHighlight(message.id);
  const frozenSpeechTextRef = useRef(messageContent);
  if (!speechActive) {
    frozenSpeechTextRef.current = messageContent;
  } else if (
    !frozenSpeechTextRef.current ||
    messageContent === frozenSpeechTextRef.current ||
    messageContent.startsWith(frozenSpeechTextRef.current)
  ) {
    frozenSpeechTextRef.current = messageContent;
  }
  const speechText = frozenSpeechTextRef.current;
  // Keep streaming markdown prep while TTS is active so word spans stay stable.
  const freezeStreamingBody = showStreaming || (speechActive && Boolean(messageContent.trim()));
  const feedbackLocked = feedback === 'up' || feedback === 'down';
  const bubbleRadius = resolveBubbleRadius(customization);
  const hasAvatarImage = Boolean(customization.avatarUrl?.trim());

  if (message.role === 'user') {
    return (
      <View style={styles.userWrap}>
        <View
          style={[
            styles.userBubble,
            {
              backgroundColor: theme.userBubbleBg,
              borderTopRightRadius: 0,
              borderTopLeftRadius: bubbleRadius,
              borderBottomLeftRadius: bubbleRadius,
              borderBottomRightRadius: bubbleRadius,
            },
          ]}>
          <Text style={[styles.messageText, { color: theme.userBubbleTextColor, fontSize, lineHeight: MESSAGE_LINE_HEIGHT }]}>
            {messageContent}
          </Text>
        </View>
      </View>
    );
  }

  const onCopy = () => {
    if (!messageContent) return;
    void copyText(messageContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sources = message.sources ?? [];
  const avatarSize = isWelcomeHero ? WELCOME_AVATAR_SIZE : 30;

  return (
    <View style={[styles.assistantRow, isWelcomeHero ? styles.welcomeHeroRow : null]}>
      {!isWelcomeHero ? (
        <View
          style={[
            styles.miniAvatar,
            { backgroundColor: hasAvatarImage ? 'transparent' : theme.avatarBg },
          ]}>
          <WidgetAvatarIcon
            avatarId={customization.avatarId}
            avatarUrl={customization.avatarUrl}
            size={30}
            color={theme.accentColor}
            avatarA11yLabel={t('chatbot.widget.app.avatar.a11y')}
          />
        </View>
      ) : null}
      <View style={[styles.assistantColumn, isWelcomeHero ? styles.welcomeHeroColumn : null]}>
        {isWelcomeHero ? (
          <View style={[styles.heroAvatar, { backgroundColor: hasAvatarImage ? 'transparent' : theme.avatarBg }]}>
            <WidgetAvatarIcon
              avatarId={customization.avatarId}
              avatarUrl={customization.avatarUrl}
              size={avatarSize}
              color={theme.accentColor}
              avatarA11yLabel={t('chatbot.widget.app.avatar.a11y')}
            />
          </View>
        ) : null}

        <View
          style={[
            styles.assistantBubble,
            {
              backgroundColor: message.error ? theme.assistantErrorBg : theme.assistantBubbleBg,
              borderTopLeftRadius: isWelcomeHero ? bubbleRadius : 0,
              borderTopRightRadius: bubbleRadius,
              borderBottomLeftRadius: bubbleRadius,
              borderBottomRightRadius: bubbleRadius,
              alignSelf: isWelcomeHero ? 'stretch' : 'flex-start',
            },
          ]}>
          {showTyping ? (
            <AppChatWidgetTypingIndicator color={theme.assistantTextColor} />
          ) : message.error ? (
            <Text
              style={[
                styles.messageText,
                { color: theme.assistantErrorText, fontSize, lineHeight: MESSAGE_LINE_HEIGHT },
              ]}>
              {messageContent}
            </Text>
          ) : (
            <AssistantBody
              content={messageContent}
              fontSize={fontSize}
              textColor={theme.assistantTextColor}
              mutedColor={theme.metaColor}
              linkColor={theme.accentColor}
              codeBackgroundColor={theme.inputSectionBg}
              streaming={freezeStreamingBody}
              showCursor={showStreaming}
              speechContentKey={message.id}
            />
          )}
        </View>

        {sources.length > 0 && !showTyping && !message.error ? (
          <View style={styles.sourcesWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: sourcesExpanded }}
              onPress={() => setSourcesExpanded((open) => !open)}
              style={styles.sourcesToggle}>
              <Text style={[styles.sourcesToggleText, { color: theme.metaColor }]}>
                {sourcesExpanded ? '▾' : '▸'} {t('chatbot.widget.app.sources.toggle', { count: sources.length })}
              </Text>
            </Pressable>
            {sourcesExpanded ? (
              <AppScrollView
                nestedScrollEnabled
                scrollbarVariant="overlay"
                style={styles.sourcesScroll}
                contentContainerStyle={styles.sourcesScrollContent}>
                {sources.map((source, index) => (
                  <CitationCard
                    key={`${source.url}-${index}`}
                    index={index + 1}
                    title={source.title || t('chatbot.widget.app.sources.fallbackTitle', { index: index + 1 })}
                    url={source.url}
                    variant="compact"
                    showUrlPath
                    borderRadius={bubbleRadius}
                    titleFontSize={fontSize}
                    indexShape="circle"
                    palette={{
                      background: theme.assistantBubbleBg,
                      border: theme.panelBorderColor,
                      text: theme.assistantTextColor,
                      muted: theme.metaColor,
                      accent: theme.starColor,
                      chipBackground: `${theme.starColor}22`,
                    }}
                  />
                ))}
              </AppScrollView>
            ) : null}
          </View>
        ) : null}

        {!showTyping && !isWelcomeHero && messageContent.trim() ? (
          <View
            style={styles.metaRow}
            {...(IS_WEB ? ({ pointerEvents: 'box-none' } as object) : null)}>
            <View
              style={styles.metaActions}
              {...(IS_WEB ? ({ pointerEvents: 'auto' } as object) : null)}>
              {customization.showSpeechOutput !== false ? (
              <ExtensionSlot
                name="chat.message.actions"
                contentKey={message.id}
                text={speechText}
                disabled={Boolean(message.error) || Boolean(message.streaming)}
                language={language}
                iconColor={theme.metaColor}
                activeColor={theme.accentColor}
                selectedIconColor={theme.accentForegroundColor}
                tooltipBackground={theme.assistantBubbleBg}
                tooltipBorder={theme.starColor}
                tooltipColor={theme.assistantTextColor}
                surface="chat"
              />
              ) : null}
              {!showStreaming ? (
                <>
              <MetaActionButton
                label={t('chatbot.widget.app.copyResponse.a11y')}
                theme={theme}
                onPress={onCopy}>
                {(iconColor) =>
                  copied ? (
                    <Check size={14} color={theme.starColor} />
                  ) : (
                    <ActionIcons.copy size={14} color={iconColor} />
                  )
                }
              </MetaActionButton>
              {collectFeedback && !message.error ? (
                <>
                  <MetaActionButton
                    label={t('chatbot.widget.app.thumbsUp.a11y')}
                    theme={theme}
                    selected={feedback === 'up'}
                    disabled={feedbackLocked}
                    onPress={() => onFeedbackPress?.('positive')}>
                    {(iconColor) => (
                      <ThumbsUp
                        size={14}
                        color={iconColor}
                        fill={feedback === 'up' ? iconColor : 'none'}
                      />
                    )}
                  </MetaActionButton>
                  <MetaActionButton
                    label={t('chatbot.widget.app.thumbsDown.a11y')}
                    theme={theme}
                    selected={feedback === 'down'}
                    disabled={feedbackLocked}
                    onPress={() => onFeedbackPress?.('negative')}>
                    {(iconColor) => (
                      <ThumbsDown
                        size={14}
                        color={iconColor}
                        fill={feedback === 'down' ? iconColor : 'none'}
                      />
                    )}
                  </MetaActionButton>
                </>
              ) : null}
                </>
              ) : null}
            </View>
            {!showStreaming && showDateTime ? (
              <Text
                pointerEvents="none"
                style={[styles.metaText, { color: theme.metaColor }]}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {feedbackOpen ? (
          <AppChatWidgetInlineFeedback
            sentiment={feedbackSentiment}
            theme={theme}
            language={language}
            submitting={feedbackSubmitting}
            onCancel={() => onFeedbackCancel?.()}
            onSubmit={(payload) => onFeedbackSubmit?.(payload)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userWrap: {
    alignItems: 'flex-end',
    width: '100%',
    paddingVertical: 10,
  },
  userBubble: {
    maxWidth: '88%',
    paddingHorizontal: 15,
    paddingVertical: 10,
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
  welcomeHeroRow: {
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '100%',
    paddingVertical: 0,
  },
  miniAvatar: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 999,
    overflow: 'hidden',
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  assistantColumn: {
    // Native: shrink-wrap like reference (avoid flex:1 full-width slabs).
    ...(IS_NATIVE
      ? { flexGrow: 0, flexShrink: 1, maxWidth: '90%' as const }
      : { flex: 1, minWidth: 0 }),
    alignItems: 'flex-start',
  },
  welcomeHeroColumn: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
  },
  assistantBubble: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxWidth: '100%',
    overflow: 'hidden',
    // Native: bubble sized to content, not stretched by flex parent.
    ...(IS_NATIVE ? { alignSelf: 'flex-start' as const } : null),
  },
  messageText: {},
  sourcesWrap: {
    marginTop: 6,
    marginBottom: 4,
    width: '100%',
    gap: 6,
  },
  sourcesToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  sourcesToggleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sourcesScroll: {
    maxHeight: SOURCES_MAX_HEIGHT,
  },
  sourcesScrollContent: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    width: '100%',
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 4 } as object) : null),
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    ...(IS_WEB ? ({ overflow: 'visible' as const, zIndex: 5 } as object) : null),
  },
  metaBtnWrap: {
    position: 'relative',
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  metaTooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 30,
    ...(IS_WEB
      ? ({
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
        } as object)
      : null),
  },
  metaTooltipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  metaBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    fontSize: 11,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 8,
  },
});
