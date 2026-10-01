import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TranscriptEmailChips } from '@/features/chat-history/components/TranscriptEmailChips';
import type { HistorySessionSummaryItem } from '@/features/chat-history/types/chat-history.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  session: HistorySessionSummaryItem | null;
  showTranscriptEmails?: boolean;
  /** i18n key for the single pane title. */
  titleKey?: string;
};

/**
 * Single compact band for the messages/feedback pane:
 * title + optional transcript email chips (no Conversation ID).
 */
export function ChatHistorySessionHeader({
  session,
  showTranscriptEmails = true,
  titleKey = 'history.listTitle',
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  if (!session) return null;

  const hasEmails = showTranscriptEmails && session.transcriptEmails.length > 0;

  return (
    <View
      accessibilityRole="header"
      style={[
        styles.wrap,
        {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          minHeight: 36,
          gap: hasEmails ? spacing.xxs : 0,
          backgroundColor: colors.surfaceMuted,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
        {t(titleKey)}
      </Text>
      {hasEmails ? <TranscriptEmailChips emails={session.transcriptEmails} compact inline /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
});
