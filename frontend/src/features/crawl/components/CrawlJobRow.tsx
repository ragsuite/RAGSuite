import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, ChevronRight, Clock } from 'lucide-react-native';

import { useCrawlLayout } from '@/features/crawl/hooks/useCrawlLayout';
import { CrawlEmbeddingCoverageWarningIcon } from '@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon';
import type { CrawlEmbeddingTargetOptions, CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { CRAWL_JOB_ROW } from '@/features/crawl/utils/crawl-layout';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import {
  getJobLastCrawlLabel,
  getJobReadinessKind,
  getJobRowStatus,
  resolveCrawlJobErrorDetail,
  shouldShowCrawlProgress,
} from '@/features/crawl/utils/crawl.utils';
import { formatCrawlJobPagesLabel } from '@/features/crawl/utils/crawl-job-pages-label';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  source: CrawlSource;
  job: CrawlJob;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  layout?: 'card' | 'table';
  embedded?: boolean;
  isLast?: boolean;
  onPress?: () => void;
};

export function CrawlJobRow({ source, job, coverageEntry, embeddingOptions, layout = 'card', embedded = false, isLast, onPress }: Props) {
  const { t, locale } = useTranslation();
  const { colors, spacing, componentRadius, typography } = useAppTheme();
  const { isCompact, isWeb } = useCrawlLayout();
  const isTable = layout === 'table' && (isWeb || !isCompact);
  const jobStatus = getJobRowStatus(source);
  const hasJob = Boolean(source.latest_job_id ?? source.active_job_id);
  const showProgress = shouldShowCrawlProgress(source);
  const progressValue = Math.max(0, Math.min(100, Math.round(source.progress_percentage ?? 0)));
  const finishedLabel = getJobLastCrawlLabel(source, locale);
  const readinessKind = getJobReadinessKind(source);
  const errorDetail =
    readinessKind === 'error'
      ? resolveCrawlJobErrorDetail(source, t('crawl.jobs.error.fallback'))
      : '';
  const errorSuffix = errorDetail ? ` • ${errorDetail}` : '';
  const pagesLabel = formatCrawlJobPagesLabel(source, job, t);

  const identity = (
    <View style={[styles.identity, isTable ? styles.identityTable : null]}>
      <View style={styles.nameRow}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]} numberOfLines={1}>
          {source.name || 'Unnamed Site'}
        </Text>
        <CrawlEmbeddingCoverageWarningIcon
          source={source}
          entry={coverageEntry}
          embeddingOptions={embeddingOptions}
        />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]} numberOfLines={1}>
        {source.base_url || 'No URL'}
      </Text>
    </View>
  );

  const statusChip = (
    <View style={styles.statusWrap}>
      <JobStatusChip label={jobStatus.label} filled={jobStatus.isRunning} />
      {jobStatus.isRunning ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </View>
  );

  const progressBar = showProgress ? (
    <View style={[styles.progressRow, isTable ? styles.progressRowTable : null]}>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressValue}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{progressValue}%</Text>
    </View>
  ) : null;

  const pagesCell = (
    <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{pagesLabel}</Text>
  );

  const finishedCell = (
    <View style={styles.finishedStack}>
      {progressBar}
      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
        {finishedLabel}
        {errorSuffix}
      </Text>
      {readinessKind === 'ready' ? (
        <View style={styles.ready}>
          <CheckCircle2 size={14} color={colors.success} />
          <Text style={[typography.caption, { color: colors.success, fontWeight: '500' }]}>Ready</Text>
        </View>
      ) : readinessKind === 'indexing' ? (
        <View style={styles.ready}>
          <Clock size={14} color={colors.warning} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Indexing…</Text>
        </View>
      ) : readinessKind === 'crawling' ? (
        <View style={styles.ready}>
          <Clock size={14} color={colors.warning} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>In progress…</Text>
        </View>
      ) : readinessKind === 'pending' ? (
        <View style={styles.ready}>
          <Clock size={14} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Pending</Text>
        </View>
      ) : null}
    </View>
  );

  const readiness =
    readinessKind === 'ready' ? (
      <View style={styles.ready}>
        <CheckCircle2 size={14} color={colors.success} />
        <Text style={[typography.caption, { color: colors.success, fontWeight: '500' }]}>Ready</Text>
      </View>
    ) : readinessKind === 'indexing' ? (
      <View style={styles.ready}>
        <Clock size={14} color={colors.warning} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>Indexing…</Text>
      </View>
    ) : readinessKind === 'crawling' ? (
      <View style={styles.ready}>
        <Clock size={14} color={colors.warning} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>In progress…</Text>
      </View>
    ) : readinessKind === 'pending' ? (
      <View style={styles.ready}>
        <Clock size={14} color={colors.textMuted} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>Pending</Text>
      </View>
    ) : null;

  const chevron = (
    <View accessible={false} style={[styles.chevronWrap, isTable ? styles.chevronTable : null]}>
      <ChevronRight size={18} color={hasJob ? colors.textMuted : `${colors.textMuted}4D`} />
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${source.name}, ${jobStatus.label}, ${pagesLabel}`}
      accessibilityHint="Opens job details"
      onPress={onPress}
      style={({ pressed, hovered }) => [
        isTable ? styles.tableRow : styles.cardRow,
        isTable
          ? {
              borderBottomColor: colors.border,
              borderBottomWidth: !isLast ? 1 : 0,
              borderTopColor: colors.border,
              borderTopWidth: embedded ? 1 : 0,
              backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 2,
              gap: CRAWL_JOB_ROW.rowGap,
            }
          : embedded
            ? {
                borderBottomColor: colors.border,
                borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                gap: spacing.xs,
                minHeight: CRAWL_MOBILE_TOUCH_MIN,
              }
            : {
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: componentRadius.card,
                backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm,
                gap: spacing.xs,
                minHeight: CRAWL_MOBILE_TOUCH_MIN,
              },
      ]}>
      {isTable ? (
        <>
          {identity}
          <View style={styles.statusCell}>{statusChip}</View>
          <View style={styles.pagesCell}>{pagesCell}</View>
          <View style={styles.finishedCell}>{finishedCell}</View>
          {chevron}
        </>
      ) : (
        <>
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <View style={styles.cardIdentity}>{identity}</View>
              {statusChip}
            </View>
            {progressBar}
            <View style={styles.cardMetaRow}>
              <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
                {pagesLabel}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={2}>
                {finishedLabel}
                {errorSuffix}
              </Text>
              {readiness}
            </View>
          </View>
          {chevron}
        </>
      )}
    </Pressable>
  );
}

function JobStatusChip({ label, filled }: { label: string; filled: boolean }) {
  const { colors, surfaceRadius, typography } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  return (
    <View
      style={[
        styles.statusChip,
        {
          borderColor: filled ? 'transparent' : colors.border,
          borderRadius: controlRadius,
          backgroundColor: filled ? colors.primary : colors.surfaceMuted,
        },
      ]}>
      <Text
        style={[
          typography.caption,
          { color: filled ? colors.textOnPrimary : colors.textMuted },
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardIdentity: {
    flex: 1,
    minWidth: 0,
  },
  identity: {
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  identityTable: {
    flex: CRAWL_JOB_ROW.identityFlex,
    minWidth: CRAWL_JOB_ROW.identityMinWidth,
  },
  statusCell: {
    width: CRAWL_JOB_ROW.statusWidth,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusChip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pagesCell: {
    width: CRAWL_JOB_ROW.pagesWidth,
    flexShrink: 0,
    justifyContent: 'center',
  },
  finishedCell: {
    flex: CRAWL_JOB_ROW.finishedFlex,
    minWidth: CRAWL_JOB_ROW.finishedMinWidth,
    alignItems: 'flex-end',
  },
  finishedStack: {
    gap: 4,
    alignItems: 'flex-end',
  },
  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  progressRowTable: {
    maxWidth: 200,
    justifyContent: 'flex-end',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    maxWidth: 96,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  chevronWrap: {
    flexShrink: 0,
    paddingLeft: 4,
    alignSelf: 'center',
  },
  chevronTable: {
    width: CRAWL_JOB_ROW.chevronWidth,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
});
