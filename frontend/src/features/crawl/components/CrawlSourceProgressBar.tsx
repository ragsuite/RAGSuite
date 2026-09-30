import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  /** 0–100; clamped and rounded for display. */
  value: number;
  /** Table cells cap the track so it lines up under the status badge; cards stretch full width. */
  layout: 'table' | 'card';
};

export function clampCrawlProgress(value: number | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

/** Crawl/index progress track shared by the source table row and the compact card. */
export function CrawlSourceProgressBar({ value, layout }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const progress = clampCrawlProgress(value);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('crawl.table.progressA11y', { value: progress })}
      accessibilityValue={{ min: 0, max: 100, now: progress }}>
      <View
        style={[
          styles.track,
          layout === 'table' ? styles.trackTable : null,
          { backgroundColor: colors.surfaceMuted },
        ]}>
        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[typography.caption, styles.value, { color: colors.textMuted }]}>{progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    minWidth: 48,
  },
  trackTable: {
    maxWidth: 80,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  value: {
    minWidth: 32,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
