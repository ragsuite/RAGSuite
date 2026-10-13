import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CrawlSourceProgressBar } from '@/features/crawl/components/CrawlSourceProgressBar';
import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import {
  CrawlSettingsSummary,
  ModelLabelStack,
  SourceIdentity,
  SourceMenuButton,
  TrainingSummary,
} from '@/features/crawl/components/CrawlSourceRowParts';
import type { CrawlSourceRowViewProps } from '@/features/crawl/components/crawl-source-row.types';
import { CRAWL_SOURCE_TABLE, CRAWL_SOURCES_ROW_MAIN_MIN_WIDTH } from '@/features/crawl/utils/crawl-layout';
import { crawlSourceColumnStyles as columns } from '@/features/crawl/utils/crawl-source-columns';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlSourceTableRow({
  source,
  coverageEntry,
  embeddingOptions,
  isLast,
  modelLabels,
  trained,
  statusLabel,
  statusTone,
  showProgress,
  progressValue,
  showCoverageWarning,
  answersSwitch,
  onOpenMenu,
  onPress,
}: CrawlSourceRowViewProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  const cells = (
    <>
      <View style={[styles.cell, columns.source]}>
        <SourceIdentity
          source={source}
          coverageEntry={coverageEntry}
          embeddingOptions={embeddingOptions}
          showCoverageWarning={showCoverageWarning}
        />
      </View>
      <View style={[styles.cell, columns.model]}>
        <ModelLabelStack labels={modelLabels} trained={trained} />
      </View>
      <View style={[styles.cell, columns.crawl]}>
        <CrawlSettingsSummary source={source} />
      </View>
      <View style={[styles.cell, styles.statusStack, columns.status]}>
        <CrawlStatusBadge label={statusLabel} tone={statusTone} preserveCase singleLine />
        {showProgress ? <CrawlSourceProgressBar value={progressValue} layout="table" /> : null}
      </View>
      <View style={[styles.cell, columns.training]}>
        <TrainingSummary source={source} />
      </View>
      <View style={[styles.cell, columns.links]}>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
          {String(source.documents_count)}
        </Text>
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
          paddingVertical: spacing.sm + 2,
          backgroundColor: colors.surface,
        },
      ]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${source.name}, ${statusLabel}`}
          accessibilityHint="Opens source details"
          onPress={onPress}
          style={({ pressed }) => [
            styles.main,
            { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
          ]}>
          {cells}
        </Pressable>
      ) : (
        <View style={styles.main}>{cells}</View>
      )}
      <View style={[styles.cell, columns.answers]}>{answersSwitch}</View>
      <View style={[styles.cell, columns.actions]}>
        <SourceMenuButton
          sourceName={source.name}
          size={{ width: CRAWL_SOURCE_TABLE.actionWidth, height: CRAWL_MOBILE_TOUCH_MIN }}
          radius={surfaceRadius.button}
          onOpenMenu={onOpenMenu}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CRAWL_SOURCE_TABLE.edgePadding,
    gap: CRAWL_SOURCE_TABLE.rowGap,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CRAWL_SOURCE_TABLE.rowGap,
    minWidth: CRAWL_SOURCES_ROW_MAIN_MIN_WIDTH,
  },
  cell: {
    justifyContent: 'center',
  },
  statusStack: {
    gap: 6,
    alignItems: 'flex-start',
  },
});
