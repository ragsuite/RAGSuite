import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Globe, SkipForward, XCircle } from 'lucide-react-native';

import { CrawlJobUrlSection } from '@/features/crawl/components/CrawlJobUrlSection';
import { EmbeddingCoverageWarningIcon } from '@/features/crawl/components/EmbeddingCoverageWarningIcon';
import { EmbeddingModelsDetail } from '@/features/crawl/components/EmbeddingModelsDetail';
import type { CrawlJob } from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  job: CrawlJob;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingCoverage?: EmbeddingItemCoverage | null;
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

export function JobDetailContent({ job, coverageEntry, embeddingCoverage }: Props) {
  const { spacing, typography, colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: spacing.lg }}>
      <EmbeddingModelsDetail
        entry={coverageEntry}
        activeProvider={embeddingCoverage?.active_provider}
        activeModel={embeddingCoverage?.active_model}
      />

      {coverageEntry?.missing_active ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <EmbeddingCoverageWarningIcon entry={coverageEntry} size={16} />
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
        title={t('crawl.jobs.detail.crawledUrls')}
        count={job.crawledUrls.length}
        total={job.crawledCount}
        items={job.crawledUrls}
        icon={Globe}
        iconColor={colors.success}
        collapsible={false}
        emptyMessage={t('crawl.jobs.detail.noCrawledUrls')}
      />
      <CrawlJobUrlSection
        title={t('crawl.jobs.detail.skippedUrls')}
        count={job.skippedUrls.length}
        total={job.skippedCount}
        items={job.skippedUrls}
        icon={SkipForward}
        iconColor={colors.warning}
        showReason
        showReferrers
        collapsible={false}
        emptyMessage={t('crawl.jobs.detail.noSkippedUrls')}
      />
      <CrawlJobUrlSection
        title={t('crawl.jobs.detail.failedUrls')}
        count={job.failedUrls.length}
        total={job.failedCount}
        items={job.failedUrls}
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
