import { Copy, Download, Languages, Settings, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiAssistantComposerInput, AI_ASSISTANT_CONTENT_MAX } from '@/features/ai-assistant/components/AiAssistantComposerInput';
import { AiAssistantDismissableMenu } from '@/features/ai-assistant/components/AiAssistantDismissableMenu';
import { AiAssistantHoverMetaButton } from '@/features/ai-assistant/components/AiAssistantHoverMetaButton';
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

const MODEL_SETTINGS_HREF = '/(app)/ai-assistant/model-settings' as const;
const ASSISTANT_AVATAR_SIZE = 28;

type Props = {
  messages: AiAssistantMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  streamingAssistantMessageId?: string | null;
  needsSettings: boolean;
  sessionTitle?: string;
  language?: string | null;
  onLanguageChange?: (language: string) => void;
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
  const items: { format: AiAssistantExportFormat; label: string }[] = [
    { format: 'markdown', label: t('aiAssistant.export.document') },
    { format: 'json', label: t('aiAssistant.export.json') },
    { format: 'pdf', label: t('aiAssistant.export.pdf') },
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
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: pressed
              ? colors.surfaceMuted
              : hovered
                ? colors.surfaceHover
                : 'transparent',
          })}
        >
          <Text style={[typography.body, { color: colors.text }]}>{item.label}</Text>
        </Pressable>
      ))}
    </>
  );
}

function MessageExportControls({
  open,
  onToggle,
  onClose,
  onCopy,
  onExport,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCopy: () => void;
  onExport: (format: AiAssistantExportFormat) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const anchorRef = useRef<View>(null);

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, position: 'relative' }}>
      <AiAssistantHoverMetaButton label={t('aiAssistant.copy')} onPress={onCopy}>
        <Copy size={14} color={colors.textMuted} />
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
  language = 'en',
  onLanguageChange,
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
  const currentLanguage = language || 'en';

  const closeMenus = useCallback(() => {
    setExportMenuFor(null);
    setSessionExportOpen(false);
    setLanguageMenuOpen(false);
  }, []);

  const composerBottomPad =
    Platform.OS === 'web' ? spacing.xxl : Math.max(insets.bottom, spacing.sm);

  useEffect(() => {
    if (!isEmpty) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages, isEmpty]);

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

  const runCopy = async (text: string) => {
    const ok = await copyText(text);
    toast({
      title: ok ? t('aiAssistant.toast.copyOk') : t('aiAssistant.toast.copyFailed'),
      variant: ok ? undefined : 'destructive',
    });
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
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              flexGrow: 1,
              alignItems: 'center',
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
                              <AppChatWidgetTypingIndicator color={colors.textMuted} />
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
                            />
                          )}
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
                              onCopy={() => void runCopy(message.content || '')}
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
            />
          </View>
        </>
      )}
    </View>
  );
}
