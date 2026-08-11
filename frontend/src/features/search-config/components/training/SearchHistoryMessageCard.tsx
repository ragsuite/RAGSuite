import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bot } from 'lucide-react-native';

import { ChatHistoryMarkdownBody } from '@/features/chat-history/components/ChatHistoryMarkdownBody';
import {
  formatSearchHistoryMessageDate,
  getSearchHistoryCreatedAt,
  parseSearchHistorySources,
} from '@/features/search-config/utils/search-history-display';
import type { SearchHistoryEntry } from '@/features/search-config/types/search-config.types';
import { CitationCard } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getRenderablePlainText } from '@/shared/utils/html-content';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  message: SearchHistoryEntry;
  onCopy: (text: string) => void;
};

export function SearchHistoryMessageCard({ message, onCopy }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const sources = useMemo(() => parseSearchHistorySources(message.sources), [message.sources]);
  const createdAt = getSearchHistoryCreatedAt(message);
  const timeLabel = formatSearchHistoryMessageDate(createdAt);
  const copyingRef = useRef(false);
  const userQuery = (message.user_message || message.query || '').trim();
  const assistantBody = message.assistant_response?.trim() ?? '';
  const hasAssistantBody = Boolean(assistantBody) || sources.length > 0;

  const copyPayload = useMemo(() => {
    const parts: string[] = [];
    if (userQuery) parts.push(userQuery);
    if (assistantBody) parts.push(getRenderablePlainText(message.assistant_response));
    if (sources.length) {
      parts.push(
        sources.map((source, index) => `[${index + 1}] ${source.title}${source.url ? `\n${source.url}` : ''}`).join('\n\n'),
      );
    }
    return parts.join('\n\n');
  }, [assistantBody, message.assistant_response, sources, userQuery]);

  return (
    <View style={{ gap: spacing.xs }}>
      {userQuery ? (
        <View style={[styles.userWrap, { gap: spacing.xxs }]}>
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
            <Text style={[typography.caption, { color: colors.textOnPrimary, lineHeight: 18 }]}>{userQuery}</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, alignSelf: 'flex-end', fontSize: 11 }]}>
            {timeLabel}
          </Text>
        </View>
      ) : null}

      <View style={[styles.assistantRow, { gap: spacing.xxs }]}>
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
        <View style={[styles.assistantColumn, { gap: spacing.xxs }]}>
          {hasAssistantBody ? (
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
              {assistantBody ? (
                <ChatHistoryMarkdownBody content={message.assistant_response} fontSize={13} headingFontWeight="500" strongFontWeight="500" />
              ) : null}
              {sources.length > 0 ? (
                <View style={{ gap: spacing.xxs }}>
                  <Text style={[typography.eyebrow, { color: colors.textSoft, fontSize: 11 }]}>
                    {t('chatbot.history.sources')}
                  </Text>
                  <View style={{ gap: spacing.xxs }}>
                    {sources.map((source, index) => (
                      <CitationCard
                        key={`${source.title}_${source.url}_${index}`}
                        index={index + 1}
                        title={source.title}
                        url={source.url}
                        variant="compact"
                        titleFontSize={13}
                        style={styles.citationCard}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.footer, { gap: spacing.xxs }]}>
            <Pressable
              onPress={() => {
                if (copyingRef.current || !copyPayload) return;
                copyingRef.current = true;
                void Promise.resolve(onCopy(copyPayload)).finally(() => {
                  copyingRef.current = false;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('search.history.copyResponse.a11y')}
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
            {!userQuery ? (
              <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>{timeLabel}</Text>
            ) : null}
          </View>
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
  citationCard: { width: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center' },
  copyBtn: { alignItems: 'center', justifyContent: 'center' },
});
