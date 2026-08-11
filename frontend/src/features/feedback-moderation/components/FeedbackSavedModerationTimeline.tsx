import { Check, Flag, StickyNote } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedbackModerationRecord } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { formatFeedbackTimestamp } from '@/features/feedback-moderation/utils/feedback-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  moderation: FeedbackModerationRecord | null;
};

export function FeedbackSavedModerationTimeline({ moderation }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  if (!moderation) {
    return (
      <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>
        {t('feedbackModeration.moderation.savedEmpty')}
      </Text>
    );
  }

  const items: { key: string; icon: React.ReactNode; title: string; note?: string; tone: 'default' | 'success' | 'danger' }[] =
    [];

  if (moderation.internal_notes?.trim()) {
    items.push({
      key: 'note',
      icon: <StickyNote size={16} color={colors.textMuted} />,
      title: moderation.internal_notes.trim(),
      tone: 'default',
    });
  }

  if (moderation.reviewed) {
    items.push({
      key: 'reviewed',
      icon: <Check size={16} color={colors.success} />,
      title: t('feedbackModeration.moderation.markReviewed'),
      note: moderation.updated_at ? formatFeedbackTimestamp(moderation.updated_at) : undefined,
      tone: 'success',
    });
  }

  if (moderation.flagged) {
    items.push({
      key: 'flagged',
      icon: <Flag size={16} color={colors.danger} />,
      title: t('feedbackModeration.moderation.flag'),
      note: moderation.flag_reason?.trim() || undefined,
      tone: 'danger',
    });
  }

  if (items.length === 0) {
    return (
      <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>
        {t('feedbackModeration.moderation.savedEmpty')}
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item) => {
        const bg =
          item.tone === 'success'
            ? colors.primaryTint
            : item.tone === 'danger'
              ? colors.dangerBackground
              : colors.surfaceMuted;

        return (
          <View
            key={item.key}
            style={[
              styles.row,
              {
                borderColor: colors.border,
                borderRadius: surfaceRadius.button,
                backgroundColor: bg,
                padding: spacing.sm,
                gap: spacing.sm,
              },
            ]}>
            {item.icon}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[typography.body, { color: colors.text, lineHeight: 20, fontWeight: '500' }]}>
                {item.title}
              </Text>
              {item.note ? (
                <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]}>{item.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
  },
});
