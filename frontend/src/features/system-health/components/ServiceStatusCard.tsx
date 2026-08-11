import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { systemHealthUi, toUiMode } from '@/features/system-health/system-health-ui.tokens';
import type { ServiceHealthRow } from '@/features/system-health/types/systemHealth.types';
import {
  formatLastHeartbeat,
  formatPredictedFailure,
  healthScoreColor,
  healthStatusVisual,
} from '@/features/system-health/utils/system-health-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  service: ServiceHealthRow;
  minHeightWeb?: number;
};

export function ServiceStatusCard({ service, minHeightWeb }: Props) {
  const { t } = useTranslation();
  const { mode, colors, spacing, typography, surfaceRadius } = useAppTheme();
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const badge = healthStatusVisual(service.status, ui, t);
  const StatusIcon = badge.Icon;
  const isWeb = Platform.OS === 'web';
  const scoreColor = healthScoreColor(service.healthScore, ui);
  const showPredicted =
    typeof service.predictedFailureMinutes === 'number' && service.predictedFailureMinutes > 0;
  const showReason = Boolean(service.reason?.trim());

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: ui.cardBorder,
          backgroundColor: ui.cardBg,
          borderRadius: ui.geometry.sectionRadius,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          gap: spacing.sm,
          ...(isWeb && typeof minHeightWeb === 'number' ? { minHeight: minHeightWeb } : null),
        },
      ]}>
      <View style={styles.topRow}>
        <Text style={[typography.subtitle, styles.name, { color: colors.text, fontSize: 16 }]} numberOfLines={2}>
          {service.name}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badge.bg,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
            },
          ]}>
          <StatusIcon size={12} color={badge.fg} strokeWidth={2.4} />
          <Text style={[typography.caption, { color: badge.fg, fontWeight: '500', fontSize: 12 }]}>{badge.label}</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={styles.scoreRow}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('system-health.healthScore')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: scoreColor, fontWeight: '500' }]}>
            {`${service.healthScore.toFixed(1)}/100`}
          </Text>
        </View>
        <View
          style={[
            styles.track,
            {
              height: ui.geometry.serviceProgressHeight,
              borderRadius: 999,
              backgroundColor: ui.mutedTrack,
            },
          ]}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.max(0, Math.min(100, service.healthScore))}%`,
                backgroundColor: colors.primary,
                borderRadius: 999,
              },
            ]}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <View style={styles.row}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('system-health.service.uptime')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: colors.text, fontWeight: '500' }]}>
            {`${service.uptimePercent.toFixed(2)}%`}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('system-health.service.lastHeartbeat')}</Text>
          <Text style={[typography.caption, typography.numeric, { color: colors.text, fontWeight: '500' }]}>
            {formatLastHeartbeat(service.lastHeartbeatSeconds, t)}
          </Text>
        </View>
        {showPredicted ? (
          <View style={styles.row}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('system-health.service.predictedFailure')}
            </Text>
            <Text style={[typography.caption, { color: ui.scoreWarn, fontWeight: '500' }]}>
              {formatPredictedFailure(service.predictedFailureMinutes ?? 0, t)}
            </Text>
          </View>
        ) : null}
      </View>

      {showReason ? (
        <View style={[styles.reasonWrap, { borderTopColor: ui.cardBorder }]}>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>
            {t('system-health.service.reason')}
          </Text>
          <Text style={[typography.body, styles.reasonText, { color: colors.text }]} numberOfLines={3}>
            {service.reason}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reasonWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
