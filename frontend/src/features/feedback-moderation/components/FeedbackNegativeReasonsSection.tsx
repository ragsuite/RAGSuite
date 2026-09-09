import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import type { FeedbackNegativeReason } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  reasons: FeedbackNegativeReason[];
};

/** Matches one StatusBadge line (caption + paddingVertical 4 + border). */
const REASON_TAGS_ROW_MIN_HEIGHT = 28;

export function FeedbackNegativeReasonsSection({ reasons }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.body, styles.title, { color: colors.text }]}>
        {t('feedbackModeration.summary.topNegativeReasons')}
      </Text>
      <View style={[styles.tags, { gap: spacing.xs, minHeight: REASON_TAGS_ROW_MIN_HEIGHT }]}>
        {reasons.length === 0 ? (
          <CrawlStatusBadge
            label={t('feedbackModeration.summary.topNegativeReasonsNone')}
            tone="muted"
            preserveCase
          />
        ) : (
          reasons.map((reason) => (
            <CrawlStatusBadge key={reason.key} label={reason.label} tone="muted" preserveCase />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {},
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
