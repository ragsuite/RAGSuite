import { Activity } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { systemHealthUi, toUiMode } from '@/features/system-health/system-health-ui.tokens';
import type { HealthStatus } from '@/features/system-health/types/systemHealth.types';
import { healthScoreColor, healthStatusVisual } from '@/features/system-health/utils/system-health-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  overallHealthScore: number;
  overallStatus: HealthStatus;
  lastUpdatedLabel: string;
  minHeightWeb?: number;
};

export function OverallHealthCard({ overallHealthScore, overallStatus, lastUpdatedLabel, minHeightWeb }: Props) {
  const { t } = useTranslation();
  const { mode, colors, spacing, typography, surfaceRadius } = useAppTheme();
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const badge = healthStatusVisual(overallStatus, ui, t);
  const BadgeIcon = badge.Icon;
  const isWeb = Platform.OS === 'web';
  const scoreColor = healthScoreColor(overallHealthScore, ui);

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: ui.geometry.sectionRadius,
          borderColor: ui.sectionBorder,
          backgroundColor: ui.sectionBg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          gap: spacing.md,
          ...(isWeb && typeof minHeightWeb === 'number' ? { minHeight: minHeightWeb } : null),
        },
      ]}>
      <View style={styles.headRow}>
        <View style={{ gap: 6, flex: 1, minWidth: 160 }}>
          <View style={styles.titleRow}>
            <Activity size={20} color={colors.text} strokeWidth={2.1} />
            <Text style={[typography.subtitle, styles.title, { color: colors.text, fontSize: isWeb ? 18 : 16 }]}>
              {t('system-health.overall.title')}
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, fontSize: 13, lineHeight: 18 }]}>
            {t('system-health.overall.lastUpdated', { timestamp: lastUpdatedLabel })}
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <View style={styles.scoreTextCol}>
            <Text style={styles.scoreLine}>
              <Text style={[typography.metric, styles.scoreValue, { color: scoreColor }]}>{overallHealthScore.toFixed(1)}</Text>
              <Text style={[typography.numeric, styles.scoreDenom, { color: colors.textMuted }]}>/100</Text>
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, fontSize: 13 }]}>
              {t('system-health.healthScore')}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: badge.bg,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              },
            ]}>
            <BadgeIcon size={14} color={badge.fg} strokeWidth={2.4} />
            <Text style={[typography.caption, { color: badge.fg, fontWeight: '500', fontSize: 13 }]}>
              {badge.label}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.track,
          {
            height: ui.geometry.overallProgressHeight,
            borderRadius: 999,
            backgroundColor: ui.mutedTrack,
          },
        ]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.max(0, Math.min(100, overallHealthScore))}%`,
              backgroundColor: colors.primary,
              borderRadius: 999,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreTextCol: {
    alignItems: 'flex-end',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  scoreDenom: {
    fontSize: 18,
    lineHeight: 28,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});
