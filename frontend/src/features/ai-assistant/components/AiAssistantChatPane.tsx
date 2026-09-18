import { Check, ChevronDown, Copy, Download, FileText, FileType, Braces, Languages, Settings, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiAssistantComposerInput, AI_ASSISTANT_CONTENT_MAX } from '@/features/ai-assistant/components/AiAssistantComposerInput';
import { AiAssistantDismissableMenu } from '@/features/ai-assistant/components/AiAssistantDismissableMenu';
import { AiAssistantHoverMetaButton } from '@/features/ai-assistant/components/AiAssistantHoverMetaButton';
import { AiAssistantSkeletonLoader } from '@/features/ai-assistant/components/AiAssistantSkeletonLoader';
import { AiAssistantSourcesList } from '@/features/ai-assistant/components/AiAssistantSourcesList';
import { AppChatWidgetMarkdownBody } from '@/features/app-chat-widget/components/AppChatWidgetMarkdownBody';
import { AppChatWidgetTypingIndicator } from '@/features/app-chat-widget/components/AppChatWidgetTypingIndicator';
import type { AiAssistantMessage } from '@/features/ai-assistant/types/ai-assistant.types';
import {
  exportAiAssistantMessages,
  type AiAssistantExportFormat,
} from '@/features/ai-assistant/utils/ai-assistant-export';
import {
  CHATBOT_LANGUAGE_OPTIONS,
  chatbotLanguageLabel,
} from '@/features/chatbot-config/utils/chatbot-language-options';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useToast } from '@/shared/toast/use-toast';
import { copyText } from '@/shared/utils/copy-text';

const MODEL_SETTINGS_HREF = '/(app)/ai-assistant/model-settings' as Href;
const ASSISTANT_AVATAR_SIZE = 28;
const NEAR_BOTTOM_PX = 96;

type Props = {
  messages: AiAssistantMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  streamingAssistantMessageId?: string | null;
  needsSettings: boolean;
  sessionTitle?: string;
  /** Active session id — used to jump to end when switching Recents chats. */
  activeSessionId?: string | null;
  language?: string | null;
  onLanguageChange?: (language: string) => void;
  answerFromSources?: boolean;
  onAnswerFromSourcesChange?: (next: boolean) => void;
  loadingStyle?: 'typing' | 'skeleton';
};

function ExportMenuItems({
  onSelect,
  onClose,
}: {
  onSelect: (format: AiAssistantExportFormat) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const items: {
    format: AiAssistantExportFormat;
    label: string;
    Icon: typeof FileText;
  }[] = [
    { format: 'markdown', label: t('aiAssistant.export.document'), Icon: FileText },
    { format: 'json', label: t('aiAssistant.export.json'), Icon: Braces },
    { format: 'pdf', label: t('aiAssistant.export.pdf'), Icon: FileType },
  ];
  return (
    <>
      {items.map((item) => (
        <Pressable
          key={item.format}
          accessibilityRole="menuitem"
          onPress={() => {
            onClose();
            onSelect(item.format);
          }}
          style={({ pressed, hovered }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.sm,
            paddingVertical: 6,
            backgroundColor: pressed
              ? colors.surfaceMuted
              : hovered
                ? colors.surfaceHover
                : 'transparent',
          })}
        >
          <item.Icon size={14} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

function MessageExportControls({
  open,
  onToggle,
  onClose,
  copyTextContent,
  onExport,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  copyTextContent: string;
  onExport: (format: AiAssistantExportFormat) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const anchorRef = useRef<View>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const onCopy = () => {
    if (!copyTextContent.trim()) return;
    void copyText(copyTextContent).then(() => {
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, position: 'relative' }}>
      <AiAssistantHoverMetaButton label={t('aiAssistant.copy')} onPress={onCopy}>
        {copied ? (
          <Check size={14} color={colors.primary} />
        ) : (
          <Copy size={14} color={colors.textMuted} />
        )}
      </AiAssistantHoverMetaButton>
      <View ref={anchorRef} collapsable={false}>
        <AiAssistantHoverMetaButton label={t('aiAssistant.export.message')} onPress={onToggle}>
          <Download size={14} color={colors.textMuted} />
        </AiAssistantHoverMetaButton>
        <AiAssistantDismissableMenu
          open={open}
          onClose={onClose}
          dismissLabel={t('common.close')}
          align="left"
          anchorRef={anchorRef}
        >
          <ExportMenuItems onClose={onClose} onSelect={onExport} />
        </AiAssistantDismissableMenu>
      </View>
    </View>
  );
}

function AssistantResponseAvatar() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={t('aiAssistant.responseAvatar')}
      style={{
        width: ASSISTANT_AVATAR_SIZE,
        height: ASSISTANT_AVATAR_SIZE,
        borderRadius: ASSISTANT_AVATAR_SIZE / 2,
        backgroundColor: colors.primaryTint,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
      }}
    >
      <Sparkles size={14} color={colors.primary} />
    </View>
  );
}

export function AiAssistantChatPane({
  messages,
  draft,
  onDraftChange,
  onSend,
  sending,
  streamingAssistantMessageId = null,
  needsSettings,
  sessionTitle,
  activeSessionId = null,
  language = 'en',
  onLanguageChange,
  answerFromSources = false,
  onAnswerFromSourcesChange,
  loadingStyle = 'typing',
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, radius } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const sessionExportAnchorRef = useRef<View>(null);
  const languageAnchorRef = useRef<View>(null);
  const isEmpty = messages.length === 0;
  const [exportMenuFor, setExportMenuFor] = useState<string | null>(null);
  const [sessionExportOpen, setSessionExportOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const currentLanguage = language || 'en';
  const composerPlaceholder = answerFromSources
    ? t('aiAssistant.askFromSources')
    : t('aiAssistant.askAnything');
  const isStreaming = Boolean(streamingAssistantMessageId);
  const shouldFollowLiveReply =
    !isEmpty && pinnedToBottom && (sending || isStreaming);

  const closeMenus = useCallback(() => {
    setExportMenuFor(null);
    setSessionExportOpen(false);
    setLanguageMenuOpen(false);
  }, []);

  const composerBottomPad =
    Platform.OS === 'web' ? spacing.xxl : Math.max(insets.bottom, spacing.sm);

  const scrollToBottom = useCallback((animated: boolean) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  const jumpToLatest = useCallback(() => {
    setPinnedToBottom(true);
    scrollToBottom(true);
  }, [scrollToBottom]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    setPinnedToBottom((prev) => (prev === nearBottom ? prev : nearBottom));
  }, []);

  // Switching Recents chats → pin to bottom for the new transcript.
  useEffect(() => {
    setPinnedToBottom(true);
  }, [activeSessionId]);

  // Instant jump to end when opening/loading a session (not during live follow).
  useEffect(() => {
    if (isEmpty || !pinnedToBottom) return;
    if (sending || isStreaming) return;
    const id = requestAnimationFrame(() => scrollToBottom(false));
    return () => cancelAnimationFrame(id);
  }, [
    activeSessionId,
    isEmpty,
    messages.length,
    pinnedToBottom,
    sending,
    isStreaming,
    scrollToBottom,
  ]);

  // Follow live reply only while pinned to bottom.
  useEffect(() => {
    if (!shouldFollowLiveReply) return;
    // Instant while streaming tokens arrive; smooth otherwise.
    scrollToBottom(!(isStreaming && streamingAssistantMessageId));
  }, [
    shouldFollowLiveReply,
    isStreaming,
    streamingAssistantMessageId,
    sending,
    messages,
    scrollToBottom,
  ]);

  const runExport = async (targetMessages: AiAssistantMessage[], format: AiAssistantExportFormat) => {
    try {
      await exportAiAssistantMessages(targetMessages, format, {
        title: sessionTitle || t('aiAssistant.title'),
      });
      toast({ title: t('aiAssistant.toast.exportOk') });
    } catch (error) {
      toast({
        title: t('aiAssistant.toast.exportFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {!isEmpty && sessionTitle ? (
            <Text
              style={[typography.body, { color: colors.text, fontWeight: '500' }]}
              numberOfLines={1}
            >
              {sessionTitle}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              height: 40,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
              {t('aiAssistant.mode.sources')}
            </Text>
            <Switch
              accessibilityLabel={t('aiAssistant.mode.sourcesA11y')}
              accessibilityRole="switch"
              accessibilityState={{ checked: answerFromSources }}
              value={answerFromSources}
              onValueChange={(next) => onAnswerFromSourcesChange?.(next)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={
                Platform.OS === 'android'
                  ? answerFromSources
                    ? colors.textOnPrimary
                    : colors.surface
                  : colors.surface
              }
              ios_backgroundColor={colors.surfaceMuted}
            />
          </View>
          <View ref={languageAnchorRef} collapsable={false}>
            <Pressable
              onPress={() => {
                setExportMenuFor(null);
                setSessionExportOpen(false);
                setLanguageMenuOpen((v) => !v);
              }}
              accessibilityLabel={t('aiAssistant.language')}
              accessibilityState={{ expanded: languageMenuOpen }}
              style={({ pressed, hovered }) => ({
                height: 40,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: spacing.xs,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: pressed
                  ? colors.surfaceMuted
                  : hovered
                    ? colors.surfaceHover
                    : colors.surface,
              })}
            >
              <Languages size={16} color={colors.text} />
              <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
                {chatbotLanguageLabel(currentLanguage)}
              </Text>
            </Pressable>
            <AiAssistantDismissableMenu
              open={languageMenuOpen}
              onClose={closeMenus}
              dismissLabel={t('common.close')}
              anchorRef={languageAnchorRef}
            >
              {CHATBOT_LANGUAGE_OPTIONS.map((option) => {
                const selected = option.key === currentLanguage;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="menuitem"
                    onPress={() => {
                      closeMenus();
                      if (option.key !== currentLanguage) {
                        onLanguageChange?.(option.key);
                      }
                    }}
                    style={({ pressed, hovered }) => ({
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      backgroundColor: pressed
                        ? colors.surfaceMuted
                        : hovered
                          ? colors.surfaceHover
                          : selected
                            ? colors.surfaceMuted
                            : 'transparent',
                    })}
                  >
                    <Text
                      style={[
                        typography.body,
                        {
                          color: colors.text,
                          fontWeight: selected ? '600' : '400',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </AiAssistantDismissableMenu>
          </View>
          {!isEmpty ? (
            <View ref={sessionExportAnchorRef} collapsable={false}>
              <Pressable
                onPress={() => {
                  setExportMenuFor(null);
                  setLanguageMenuOpen(false);
                  setSessionExportOpen((v) => !v);
                }}
                accessibilityLabel={t('aiAssistant.export.session')}
                accessibilityState={{ expanded: sessionExportOpen }}
                style={({ pressed, hovered }) => ({
                  height: 40,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: spacing.xs,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  backgroundColor: pressed
                    ? colors.surfaceMuted
                    : hovered
                      ? colors.surfaceHover
                      : colors.surface,
                })}
              >
                <Download size={16} color={colors.text} />
                <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
                  {t('aiAssistant.export.session')}
                </Text>
              </Pressable>
              <AiAssistantDismissableMenu
                open={sessionExportOpen}
                onClose={closeMenus}
                dismissLabel={t('common.close')}
                anchorRef={sessionExportAnchorRef}
              >
                <ExportMenuItems
                  onClose={closeMenus}
                  onSelect={(format) => void runExport(messages, format)}
                />
              </AiAssistantDismissableMenu>
            </View>
          ) : null}
          <Pressable
            onPress={() => router.push(MODEL_SETTINGS_HREF)}
            accessibilityLabel={t('aiAssistant.openSettings')}
            style={({ pressed, hovered }) => ({
              height: 40,
              width: 40,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: pressed
                ? colors.surfaceMuted
                : hovered
                  ? colors.surfaceHover
                  : colors.surface,
            })}
          >
            <Settings size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {isEmpty ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing.lg,
            paddingBottom: composerBottomPad,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: AI_ASSISTANT_CONTENT_MAX,
              alignSelf: 'center',
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <Text style={[typography.pageDisplay, { color: colors.text, textAlign: 'center' }]}>
              {t('aiAssistant.greeting')}
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.textMuted,
                  textAlign: 'center',
                  maxWidth: 480,
                  alignSelf: 'center',
                },
              ]}
            >
              {t('aiAssistant.greetingHint')}
            </Text>
            {needsSettings ? (
              <Pressable
                onPress={() => router.push(MODEL_SETTINGS_HREF)}
                style={({ pressed, hovered }) => ({
                  marginTop: spacing.sm,
                  alignSelf: 'center',
                  paddingHorizontal: spacing.lg,
                  height: 44,
                  borderRadius: radius.md,
                  backgroundColor: pressed || hovered ? colors.primaryPressed : colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={[typography.buttonLabel, { color: colors.textOnPrimary }]}>
                  {t('aiAssistant.configureModels')}
                </Text>
              </Pressable>
            ) : null}
            <View style={{ width: '100%', marginTop: spacing.lg }}>
              <AiAssistantComposerInput
                draft={draft}
                onDraftChange={onDraftChange}
                onSend={onSend}
                sending={sending}
                needsSettings={needsSettings}
                placeholder={composerPlaceholder}
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={{ flex: 1, position: 'relative' }}>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                flexGrow: 1,
                alignItems: 'center',
              }}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!shouldFollowLiveReply) return;
                scrollToBottom(!(isStreaming && streamingAssistantMessageId));
              }}
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: AI_ASSISTANT_CONTENT_MAX,
                  gap: spacing.md,
                }}
              >
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  const isStreamingAssistant =
                    !isUser && message.id === streamingAssistantMessageId;
                  const isThinking =
                    isStreamingAssistant && !(message.content || '').trim();
                  return (
                    <View
                      key={message.id}
                      style={{
                        alignSelf: isUser ? 'flex-end' : 'stretch',
                        maxWidth: isUser ? '85%' : '100%',
                        gap: spacing.xs,
                      }}
                    >
                      {isUser ? (
                        <View
                          style={{
                            borderRadius: radius.lg,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            backgroundColor: colors.primaryTint,
                            alignSelf: 'flex-end',
                          }}
                        >
                          <Text style={[typography.body, { color: colors.text }]}>
                            {message.content || ''}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                          <AssistantResponseAvatar />
                          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                            {isThinking ? (
                              <View style={{ paddingVertical: spacing.xs }}>
                                {loadingStyle === 'skeleton' ? (
                                  <AiAssistantSkeletonLoader compact />
                                ) : (
                                  <AppChatWidgetTypingIndicator color={colors.textMuted} />
                                )}
                              </View>
                            ) : (
                              <AppChatWidgetMarkdownBody
                                content={message.content || ''}
                                textColor={colors.text}
                                mutedColor={colors.textMuted}
                                linkColor={colors.primary}
                                codeBackgroundColor={colors.surfaceMuted}
                                fontSize={typography.body.fontSize ?? 15}
                                streaming={isStreamingAssistant}
                                onInAppHref={
                                  answerFromSources
                                    ? undefined
                                    : (href) => {
                                        router.push(href as Href);
                                      }
                                }
                              />
                            )}
                            {!isStreamingAssistant &&
                            message.citations &&
                            message.citations.length > 0 ? (
                              <AiAssistantSourcesList citations={message.citations} />
                            ) : null}
                            {message.content?.trim() && !isStreamingAssistant ? (
                              <MessageExportControls
                                open={exportMenuFor === message.id}
                                onToggle={() => {
                                  setSessionExportOpen(false);
                                  setExportMenuFor((prev) =>
                                    prev === message.id ? null : message.id,
                                  );
                                }}
                                onClose={closeMenus}
                                copyTextContent={message.content || ''}
                                onExport={(format) => void runExport([message], format)}
                              />
                            ) : null}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {!isEmpty && !pinnedToBottom ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('aiAssistant.scrollToLatest.a11y')}
                hitSlop={8}
                onPress={jumpToLatest}
                style={({ pressed, hovered }) => [
                  styles.scrollLatestBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.98 : hovered ? 1.04 : 1 }],
                  },
                ]}
              >
                <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>

          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: composerBottomPad,
              backgroundColor: colors.surface,
              alignItems: 'center',
            }}
          >
            <AiAssistantComposerInput
              draft={draft}
              onDraftChange={onDraftChange}
              onSend={onSend}
              sending={sending}
              needsSettings={needsSettings}
              placeholder={composerPlaceholder}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
