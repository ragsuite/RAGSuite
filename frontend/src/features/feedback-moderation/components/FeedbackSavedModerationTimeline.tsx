import { Check, Flag, StickyNote } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedbackModerationRecord } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { formatFeedbackTimestamp, hasSavedModeration } from '@/features/feedback-moderation/utils/feedback-display';
import { useTranslation } from '@/i18n';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  moderation: FeedbackModerationRecord | null;
};

export function FeedbackSavedModerationTimeline({ moderation }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  if (!moderation || !hasSavedModeration(moderation)) {
    return (
      <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>
        {t('feedbackModeration.moderation.savedEmpty')}
      </Text>
    );
  }

  const notes = moderation.internal_notes?.trim();
  const reviewedAt = moderation.reviewed_at ?? moderation.updated_at;
  const flagReason = moderation.flag_reason?.trim();
  const details = [
    moderation.reviewed && reviewedAt
      ? t('feedbackModeration.moderation.reviewedOn', { date: formatFeedbackTimestamp(reviewedAt) })
      : null,
    moderation.flagged && flagReason
      ? t('feedbackModeration.moderation.flagReasonValue', { reason: flagReason })
      : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <View style={{ gap: spacing.sm }}>
      {notes ? (
        <View
          style={[
            styles.note,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: colors.surfaceMuted,
              padding: spacing.sm,
              gap: spacing.sm,
            },
          ]}>
          <StickyNote size={16} color={colors.textMuted} />
          <Text style={[typography.body, styles.noteText, { color: colors.text }]}>{notes}</Text>
        </View>
      ) : null}
      {moderation.reviewed || moderation.flagged ? (
        <View style={[styles.tags, { gap: spacing.xs }]}>
          {moderation.reviewed ? (
            <StatusBadge label={t('feedbackModeration.moderation.tag.reviewed')} tone="success" icon={Check} preserveCase />
          ) : null}
          {moderation.flagged ? (
            <StatusBadge label={t('feedbackModeration.moderation.tag.flagged')} tone="danger" icon={Flag} preserveCase />
          ) : null}
        </View>
      ) : null}
      {details.length > 0 ? (
        <View style={{ gap: spacing.xxs }}>
          {details.map((line) => (
            <Text key={line} style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
  },
  noteText: {
    flex: 1,
    minWidth: 0,
    lineHeight: 20,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
