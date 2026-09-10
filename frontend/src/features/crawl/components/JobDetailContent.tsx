import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Globe, Info, SkipForward, XCircle } from 'lucide-react-native';

import { CrawlJobUrlSection } from '@/features/crawl/components/CrawlJobUrlSection';
import { CrawlEmbeddingCoverageWarningIcon } from '@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon';
import { EmbeddingModelsDetail } from '@/features/crawl/components/EmbeddingModelsDetail';
import type { CrawlEmbeddingTargetOptions, CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { shouldShowCrawlEmbeddingCoverageWarning } from '@/features/crawl/utils/crawl-embedding-display';
import { useTranslation } from '@/i18n';
import { AdaptivePopover } from '@/shared/components/adaptive/adaptive-popover';
import { usePopoverAnchor } from '@/shared/hooks/use-popover-anchor';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const HELP_POPOVER_WIDTH = 300;

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
  const { spacing, typography, colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { anchorRef, open, anchor, openMenu, close } = usePopoverAnchor();
  const pinnedByClickRef = useRef(false);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCoverageWarning = shouldShowCrawlEmbeddingCoverageWarning(
    source,
    coverageEntry,
    embeddingOptions,
  );

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current != null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  const dismissHelp = useCallback(() => {
    clearHoverCloseTimer();
    pinnedByClickRef.current = false;
    close();
  }, [clearHoverCloseTimer, close]);

  const onInfoPress = useCallback(() => {
    clearHoverCloseTimer();
    if (open && pinnedByClickRef.current) {
      dismissHelp();
      return;
    }
    pinnedByClickRef.current = true;
    if (!open) {
      openMenu();
    }
  }, [clearHoverCloseTimer, dismissHelp, open, openMenu]);

  const onHelpHoverIn = useCallback(() => {
    if (Platform.OS !== 'web') return;
    clearHoverCloseTimer();
    if (!open) openMenu();
  }, [clearHoverCloseTimer, open, openMenu]);

  const onHelpHoverOut = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (pinnedByClickRef.current) return;
    clearHoverCloseTimer();
    // Allow pointer to move from icon into the floating tooltip without dismissing.
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      if (!pinnedByClickRef.current) close();
    }, 120);
  }, [clearHoverCloseTimer, close]);

  const statsHelpAccessory = (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('crawl.jobs.detail.statsHelp.a11y')}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={onInfoPress}
        onHoverIn={onHelpHoverIn}
        onHoverOut={onHelpHoverOut}
        style={({ pressed }) => [
          styles.infoBtn,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: pressed || open ? colors.surfaceMuted : 'transparent',
          },
        ]}>
        <Info size={18} color={colors.primary} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <EmbeddingModelsDetail
        entry={coverageEntry}
        activeProvider={embeddingCoverage?.active_provider}
        activeModel={embeddingCoverage?.active_model}
        accessory={statsHelpAccessory}
      />

      <AdaptivePopover
        visible={open}
        onClose={dismissHelp}
        anchor={anchor}
        title={t('crawl.jobs.detail.statsHelp.title')}
        accessibilityLabel={t('crawl.jobs.detail.statsHelp.a11y')}
        popoverWidth={HELP_POPOVER_WIDTH}
        lockWidth
        maxHeight={240}
        blocking={false}
        contentStyle={{ padding: spacing.sm }}>
        <Pressable onHoverIn={onHelpHoverIn} onHoverOut={onHelpHoverOut}>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
            {t('crawl.jobs.detail.statsHelp.body')}
          </Text>
        </Pressable>
      </AdaptivePopover>

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
  infoBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
