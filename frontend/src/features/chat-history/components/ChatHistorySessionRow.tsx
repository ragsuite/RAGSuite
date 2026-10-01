import { ChevronRight, MessageSquare } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TranscriptEmailChips } from '@/features/chat-history/components/TranscriptEmailChips';
import type { HistorySessionSummaryItem } from '@/features/chat-history/types/chat-history.types';
import { formatQueryTimestamp } from '@/features/chat-history/utils/chat-history-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  item: HistorySessionSummaryItem;
  selected?: boolean;
  showTranscriptEmails?: boolean;
  onPress: (item: HistorySessionSummaryItem) => void;
};

export function ChatHistorySessionRow({
  item,
  selected = false,
  showTranscriptEmails = true,
  onPress,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const stamp = item.lastAt ? formatQueryTimestamp(item.lastAt) : '';
  const hasEmails = showTranscriptEmails && item.transcriptEmails.length > 0;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.surfaceMuted : colors.surface,
          borderBottomColor: colors.border,
          ...(selected
            ? { borderLeftWidth: 3, borderLeftColor: colors.primary }
            : { borderLeftWidth: 0 }),
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(item)}
        style={({ pressed, hovered }) => ({
          backgroundColor:
            selected || pressed
              ? colors.surfaceMuted
              : hovered
                ? colors.surfaceHover
                : 'transparent',
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: hasEmails ? spacing.xxs : spacing.sm,
        })}>
        <Text
          style={[
            typography.body,
            styles.preview,
            { color: colors.text, fontWeight: '500', fontSize: 15, lineHeight: 20 },
          ]}
          numberOfLines={1}>
          {item.preview || t('history.sessions.untitled')}
        </Text>
        <View style={[styles.metaRow, { gap: spacing.xs, marginTop: 2 }]}>
          <MessageSquare size={13} color={colors.textMuted} />
          <Text
            style={[typography.caption, { color: colors.textMuted, flex: 1, fontSize: 12 }]}
            numberOfLines={1}>
            {item.feedbackCount != null
              ? t('feedbackModeration.sessions.feedbackCount', { count: item.feedbackCount })
              : t('history.sessions.messageCount', { count: item.messageCount })}
            {stamp ? ` · ${stamp}` : ''}
          </Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </View>
      </Pressable>
      {hasEmails ? (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
          <TranscriptEmailChips emails={item.transcriptEmails} compact />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preview: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
