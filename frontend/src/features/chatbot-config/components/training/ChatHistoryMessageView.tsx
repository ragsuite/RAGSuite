import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bot } from 'lucide-react-native';

import { ChatHistoryMarkdownBody } from '@/features/chat-history/components/ChatHistoryMarkdownBody';
import type { ChatHistoryMessage } from '@/features/chatbot-config/types/chatbot-config.types';
import { formatChatHistoryMessageDate } from '@/features/chatbot-config/utils/training-overview-display';
import { CitationCard } from '@/shared/components/brand';
import { copyText } from '@/shared/utils/copy-text';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

function buildCopyPayload(message: ChatHistoryMessage): string {
  const parts: string[] = [];
  if (message.content.trim()) parts.push(message.content.trim());
  if (message.sources?.length) {
    parts.push(
      message.sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}`).join('\n\n'),
    );
  }
  return parts.join('\n\n');
}

type Props = {
  message: ChatHistoryMessage;
  onNotify: (message: string, type?: 'success' | 'error') => void;
};

export function ChatHistoryMessageView({ message, onNotify }: Props) {
  const { colors, spacing, typography, radius, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const timeLabel = formatChatHistoryMessageDate(message.createdAt);
  const copyingRef = useRef(false);

  const onCopy = async () => {
    if (copyingRef.current) return;
    const payload = buildCopyPayload(message);
    if (!payload) return;
    copyingRef.current = true;
    try {
      const ok = await copyText(payload);
      onNotify(ok ? t('chatbot.history.copySuccess') : t('chatbot.history.copyFailed'), ok ? 'success' : 'error');
    } finally {
      copyingRef.current = false;
    }
  };

  if (isUser) {
    return (
      <View style={[styles.userWrap, { gap: spacing.xs }]}>
        <View
          style={[
            styles.userBubble,
            {
              borderRadius: panelRadius,
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            },
          ]}>
          <Text style={[typography.caption, { color: colors.textOnPrimary, lineHeight: 18 }]}>{message.content}</Text>
        </View>
        <Text style={[typography.caption, { color: colors.textMuted, alignSelf: 'flex-end' }]}>{timeLabel}</Text>
      </View>
    );
  }

  const hasBody = Boolean(message.content.trim()) || Boolean(message.sources?.length);

  return (
    <View style={[styles.assistantRow, { gap: spacing.xs }]}>
      <View
        style={[
          styles.botAvatar,
          {
            borderRadius: panelRadius,
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
        ]}
        accessibilityElementsHidden>
        <Bot size={14} color={colors.textOnPrimary} />
      </View>
      <View style={[styles.assistantColumn, { gap: spacing.xs }]}>
        {hasBody ? (
          <View
            style={[
              styles.assistantCard,
              {
                borderRadius: panelRadius,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: spacing.xs,
                gap: spacing.xxs,
              },
            ]}>
            {message.content.trim() ? (
              <ChatHistoryMarkdownBody content={message.content} fontSize={13} headingFontWeight="500" strongFontWeight="500" />
            ) : null}
            {message.sources?.length ? (
              <View style={{ gap: spacing.xxs }}>
                <Text style={[typography.eyebrow, { color: colors.textSoft, fontSize: 11 }]}>
                  {t('chatbot.history.sources')}
                </Text>
                <View style={{ gap: spacing.xxs }}>
                  {message.sources.map((source, index) => (
                    <CitationCard
                      key={`${source.url}_${source.title}`}
                      index={index + 1}
                      title={source.title}
                      url={source.url}
                      variant="compact"
                      titleFontSize={13}
                      style={styles.sourceCardItem}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.assistantFooter, { gap: spacing.xxs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.history.copyMessageA11y')}
            onPress={() => void onCopy()}
            style={({ pressed }) => [
              styles.copyBtn,
              {
                minWidth: 28,
                minHeight: 28,
                borderRadius: controlRadius,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ActionIcons.copy size={13} color={colors.textMuted} />
          </Pressable>
          <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{timeLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userWrap: { alignItems: 'flex-end', maxWidth: '100%' },
  userBubble: { maxWidth: '88%' },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: '100%' },
  botAvatar: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  assistantColumn: { flex: 1, minWidth: 0 },
  assistantCard: { borderWidth: 1, maxWidth: '100%' },
  assistantFooter: { flexDirection: 'row', alignItems: 'center' },
  copyBtn: { alignItems: 'center', justifyContent: 'center' },
  sourceCardItem: { width: '100%' },
});
