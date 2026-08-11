import { Clock, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { FeedbackCompactKpiCard } from '@/features/feedback-moderation/components/FeedbackCompactKpiCard';
import type { FeedbackSummary } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { formatAvgResponseMs } from '@/features/feedback-moderation/utils/feedback-display';
import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { TwoByTwoGrid } from '@/shared/components/dashboard/two-by-two-grid';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  summary: FeedbackSummary | null;
  loading?: boolean;
};

export function FeedbackSummaryCards({ summary, loading }: Props) {
  const { spacing, colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { useKpiTwoColumnGrid } = useFeedbackLayout();

  if (loading || !summary) {
    if (useKpiTwoColumnGrid) {
      return (
        <TwoByTwoGrid gap={spacing.sm}>
          {[0, 1, 2, 3].map((key) => (
            <View key={key} style={[styles.skeleton, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          ))}
        </TwoByTwoGrid>
      );
    }
    return (
      <View style={[styles.gridRow, { gap: spacing.sm }]}>
        {[0, 1, 2, 3].map((key) => (
          <View key={key} style={[styles.gridCellWide, styles.skeleton, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
        ))}
      </View>
    );
  }

  const cards = [
    {
      key: 'total',
      label: t('feedbackModeration.summary.total'),
      value: String(summary.totalCount),
      note: undefined,
      icon: MessageSquare,
      valueTone: 'default' as const,
    },
    {
      key: 'positive',
      label: t('feedbackModeration.summary.positivePct'),
      value: `${summary.positivePct}%`,
      note: `${summary.positiveCount} ${t('feedbackModeration.summary.votes')}`,
      icon: ThumbsUp,
      valueTone: 'success' as const,
    },
    {
      key: 'negative',
      label: t('feedbackModeration.summary.negativePct'),
      value: `${summary.negativePct}%`,
      note: `${summary.negativeCount} ${t('feedbackModeration.summary.votes')}`,
      icon: ThumbsDown,
      valueTone: 'danger' as const,
      noteTone: 'danger' as const,
    },
    {
      key: 'latency',
      label: t('feedbackModeration.summary.avgMs'),
      value: formatAvgResponseMs(summary.avgTotalMs),
      note: `${t('feedbackModeration.summary.flagged')}: ${summary.flaggedCount} · ${t('feedbackModeration.summary.reviewed')}: ${summary.reviewedCount}`,
      icon: Clock,
      valueTone: 'default' as const,
    },
  ];

  if (useKpiTwoColumnGrid) {
    return (
      <TwoByTwoGrid gap={spacing.sm}>
        {cards.map((card) => (
          <FeedbackCompactKpiCard
            key={card.key}
            label={card.label}
            value={card.value}
            note={card.note ?? ''}
            icon={card.icon}
            noteTone={card.noteTone}
            valueTone={card.valueTone}
          />
        ))}
      </TwoByTwoGrid>
    );
  }

  return (
    <View style={[styles.gridRow, { gap: spacing.sm }]}>
      <KpiCard label={t('feedbackModeration.summary.total')} value={String(summary.totalCount)} note="" icon={MessageSquare} />
      <KpiCard
        label={t('feedbackModeration.summary.positivePct')}
        value={`${summary.positivePct}%`}
        note={`${summary.positiveCount} ${t('feedbackModeration.summary.votes')}`}
        icon={ThumbsUp}
        valueSeverity="success"
      />
      <KpiCard
        label={t('feedbackModeration.summary.negativePct')}
        value={`${summary.negativePct}%`}
        note={`${summary.negativeCount} ${t('feedbackModeration.summary.votes')}`}
        icon={ThumbsDown}
        severity="danger"
        valueSeverity="danger"
      />
      <KpiCard
        label={t('feedbackModeration.summary.avgMs')}
        value={formatAvgResponseMs(summary.avgTotalMs)}
        note={`${t('feedbackModeration.summary.flagged')}: ${summary.flaggedCount} · ${t('feedbackModeration.summary.reviewed')}: ${summary.reviewedCount}`}
        icon={Clock}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridCellWide: {
    flex: 1,
    minWidth: 140,
  },
  skeleton: {
    minHeight: 88,
    width: '100%',
  },
});
