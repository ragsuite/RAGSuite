import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Globe, SkipForward, XCircle } from 'lucide-react-native';

import { CrawlJobUrlSection } from '@/features/crawl/components/CrawlJobUrlSection';
import { CrawlEmbeddingCoverageWarningIcon } from '@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon';
import { EmbeddingModelsDetail } from '@/features/crawl/components/EmbeddingModelsDetail';
import type { CrawlEmbeddingTargetOptions, CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { shouldShowCrawlEmbeddingCoverageWarning } from '@/features/crawl/utils/crawl-embedding-display';
import { useTranslation } from '@/i18n';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  job: CrawlJob;
  source: CrawlSource;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingCoverage?: EmbeddingItemCoverage | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
};

function StatCard({ label, value }: { label: string; value: number }) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  return (
    <View
      style={[
        styles.statCard,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.sm,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.headingSemibold, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export function JobDetailContent({ job, source, coverageEntry, embeddingCoverage, embeddingOptions }: Props) {
  const { spacing, typography, colors } = useAppTheme();
  const { t } = useTranslation();
  const showCoverageWarning = shouldShowCrawlEmbeddingCoverageWarning(
    source,
    coverageEntry,
    embeddingOptions,
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <EmbeddingModelsDetail
        entry={coverageEntry}
        activeProvider={embeddingCoverage?.active_provider}
        activeModel={embeddingCoverage?.active_model}
        accessory={
          <InfoHintButton
            title={t('crawl.jobs.detail.statsHelp.title')}
            body={t('crawl.jobs.detail.statsHelp.body')}
            accessibilityLabel={t('crawl.jobs.detail.statsHelp.a11y')}
          />
        }
      />

      {showCoverageWarning ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <CrawlEmbeddingCoverageWarningIcon
            source={source}
            entry={coverageEntry}
            embeddingOptions={embeddingOptions}
            size={16}
          />
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
            {t('crawl.jobs.detail.embeddingCoverageWarning')}
          </Text>
        </View>
      ) : null}

      <View style={[styles.statsRow, { gap: spacing.sm }]}>
        <StatCard label={t('crawl.jobs.detail.stat.crawled')} value={job.crawledCount} />
        <StatCard label={t('crawl.jobs.detail.stat.skipped')} value={job.skippedCount} />
        <StatCard label={t('crawl.jobs.detail.stat.failed')} value={job.failedCount} />
      </View>

      <CrawlJobUrlSection
        key={`${job.id}-crawled`}
        jobId={job.id}
        kind="crawled"
        title={t('crawl.jobs.detail.crawledUrls')}
        headerTotal={job.crawledCount}
        items={job.crawledUrls}
        listTotal={job.urlListTotals?.crawled ?? job.crawledUrls.length}
        icon={Globe}
        iconColor={colors.success}
        collapsible={false}
        emptyMessage={t('crawl.jobs.detail.noCrawledUrls')}
      />
      <CrawlJobUrlSection
        key={`${job.id}-skipped`}
        jobId={job.id}
        kind="skipped"
        title={t('crawl.jobs.detail.skippedUrls')}
        headerTotal={job.skippedCount}
        items={job.skippedUrls}
        listTotal={job.urlListTotals?.skipped ?? job.skippedUrls.length}
        icon={SkipForward}
        iconColor={colors.warning}
        showReason
        showReferrers
        collapsible={false}
        emptyMessage={t('crawl.jobs.detail.noSkippedUrls')}
      />
      <CrawlJobUrlSection
        key={`${job.id}-failed`}
        jobId={job.id}
        kind="failed"
        title={t('crawl.jobs.detail.failedUrls')}
        headerTotal={job.failedCount}
        items={job.failedUrls}
        listTotal={job.urlListTotals?.failed ?? job.failedUrls.length}
        icon={XCircle}
        iconColor={colors.danger}
        showReason
        showStatus
        showReferrers
        collapsible={false}
        emptyMessage={t('crawl.jobs.detail.noFailedUrls')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
});
