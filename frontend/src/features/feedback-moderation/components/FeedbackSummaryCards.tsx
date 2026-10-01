import type { LucideIcon } from 'lucide-react-native';
import { Clock, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedbackSummary } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { formatAvgResponseMs } from '@/features/feedback-moderation/utils/feedback-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  summary: FeedbackSummary | null;
  loading?: boolean;
};

type Metric = {
  key: string;
  icon: LucideIcon;
  value: string;
  label: string;
  note?: string;
  valueTone?: 'default' | 'success' | 'danger';
};

/**
 * Compact horizontal metrics strip for Feedback chrome.
 * Same summary fields as the former 4-card KPI grid, far less vertical height.
 */
export function FeedbackSummaryCards({ summary, loading }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  if (loading || !summary) {
    return (
      <View
        style={[
          styles.strip,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: 8,
            minHeight: 44,
          },
        ]}
      />
    );
  }

  const metrics: Metric[] = [
    {
      key: 'total',
      icon: MessageSquare,
      value: String(summary.totalCount),
      label: t('feedbackModeration.summary.total'),
    },
    {
      key: 'positive',
      icon: ThumbsUp,
      value: `${summary.positivePct}%`,
      label: t('feedbackModeration.summary.positivePct'),
      note: `${summary.positiveCount} ${t('feedbackModeration.summary.votes')}`,
      valueTone: 'success',
    },
    {
      key: 'negative',
      icon: ThumbsDown,
      value: `${summary.negativePct}%`,
      label: t('feedbackModeration.summary.negativePct'),
      note: `${summary.negativeCount} ${t('feedbackModeration.summary.votes')}`,
      valueTone: 'danger',
    },
    {
      key: 'latency',
      icon: Clock,
      value: formatAvgResponseMs(summary.avgTotalMs),
      label: t('feedbackModeration.summary.avgMs'),
      note: `${t('feedbackModeration.summary.flagged')}: ${summary.flaggedCount} · ${t('feedbackModeration.summary.reviewed')}: ${summary.reviewedCount}`,
    },
  ];

  return (
    <View
      style={[
        styles.strip,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.md,
        },
      ]}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const valueColor =
          metric.valueTone === 'success'
            ? colors.success
            : metric.valueTone === 'danger'
              ? colors.danger
              : colors.text;
        return (
          <View key={metric.key} style={[styles.metric, { gap: spacing.xs }]}>
            <Icon size={14} color={colors.textMuted} />
            <Text
              style={[
                typography.body,
                { color: valueColor, fontWeight: '700', fontSize: 15, lineHeight: 20 },
              ]}
              numberOfLines={1}>
              {metric.value}
            </Text>
            <Text
              style={[typography.caption, { color: colors.textMuted, flexShrink: 1 }]}
              numberOfLines={1}>
              {metric.label}
              {metric.note ? ` · ${metric.note}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
});
