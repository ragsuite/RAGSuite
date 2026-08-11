import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { systemHealthUi, toUiMode } from '@/features/system-health/system-health-ui.tokens';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  minHeightWeb?: number;
};

export function HealthLegend({ minHeightWeb }: Props) {
  const { t } = useTranslation();
  const { mode, colors, spacing, typography, surfaceRadius } = useAppTheme();
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const isWeb = Platform.OS === 'web';
  const rows = useMemo(
    () => [
      {
        key: 'healthy',
        label: t('system-health.status.healthy'),
        note: t('system-health.legend.healthy.description'),
        bg: ui.healthy.bg,
        fg: ui.healthy.fg,
        Icon: CheckCircle2,
      },
      {
        key: 'degraded',
        label: t('system-health.status.degraded'),
        note: t('system-health.legend.degraded.description'),
        bg: ui.degraded.bg,
        fg: ui.degraded.fg,
        Icon: AlertTriangle,
      },
      {
        key: 'atRisk',
        label: t('system-health.status.atRisk'),
        note: t('system-health.legend.atRisk.description'),
        bg: ui.atRisk.bg,
        fg: ui.atRisk.fg,
        Icon: Clock,
      },
      {
        key: 'down',
        label: t('system-health.status.down'),
        note: t('system-health.legend.down.description'),
        bg: ui.down.bg,
        fg: ui.down.fg,
        Icon: AlertCircle,
      },
    ],
    [t, ui],
  );

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
          gap: spacing.sm,
          ...(isWeb && typeof minHeightWeb === 'number' ? { minHeight: minHeightWeb } : null),
        },
      ]}>
      <Text style={[typography.subtitle, { color: colors.text, fontSize: 16 }]}>
        {t('system-health.legend.title')}
      </Text>
      <View style={[styles.rowWrap, { gap: spacing.md }]}>
        {rows.map((row) => {
          const Icon = row.Icon;
          return (
            <View key={row.key} style={styles.rowItem}>
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: row.bg,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  },
                ]}>
                <Icon size={12} color={row.fg} strokeWidth={2.4} />
                <Text style={[typography.caption, { color: row.fg, fontWeight: '500' }]}>{row.label}</Text>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted, flexShrink: 1 }]}>{row.note}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
