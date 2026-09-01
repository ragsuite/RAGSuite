import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Globe } from 'lucide-react-native';

import { CrawlFilterSelect } from '@/features/crawl/components/CrawlFilterSelect';
import { CrawlJobRow } from '@/features/crawl/components/CrawlJobRow';
import { CrawlJobsTable } from '@/features/crawl/components/CrawlJobsTable';
import { CrawlMobileFilterSection, crawlFilterClearStyle } from '@/features/crawl/components/CrawlMobileFilterSection';
import { CrawlPanelCard } from '@/features/crawl/components/CrawlPanelCard';
import { CrawlSearchField } from '@/features/crawl/components/CrawlSearchField';
import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { CrawlSourceRow } from '@/features/crawl/components/CrawlSourceRow';
import { CrawlSourcesTable } from '@/features/crawl/components/CrawlSourcesTable';
import { CrawlTabPanelHeader } from '@/features/crawl/components/CrawlTabPanelHeader';
import { useCrawlLayout } from '@/features/crawl/hooks/useCrawlLayout';
import { useCrawlManagement } from '@/features/crawl/hooks/useCrawlManagement';
import type { CrawlCadence, CrawlJobFilterStatus, CrawlSourceFilterStatus } from '@/features/crawl/types/crawl.types';
import {
  countActiveCrawlJobs,
  DEFAULT_MAX_CONCURRENT_CRAWLS,
  isAtConcurrentCrawlLimit,
} from '@/features/crawl/utils/crawl-pipeline-status';
import { matchesJobSourceFilter, matchesSourceStatusFilter } from '@/features/crawl/utils/crawl.utils';
import { expandCrawlSourcesForTable } from '@/features/crawl/utils/crawl-embedding-display';
import { buildCoverageByCrawlSourceId } from '@/features/crawl/utils/document-api-mappers';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { semanticBannerTones } from '@/shared/utils/semantic-banner-tones';
import { ActionIcons } from '@/shared/constants/action-icons';

function countActiveFilters(values: string[]) {
  return values.filter((value) => value !== 'all').length;
}

function useDomainSubTabs() {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { key: 'sources' as const, label: t('crawl.domain.tabs.sources') },
      { key: 'jobs' as const, label: t('crawl.domain.tabs.jobs') },
    ],
    [t],
  );
}

function DomainHeaderBlock() {
  const { t } = useTranslation();
  const { saving, openSheet } = useCrawlManagement();

  return (
    <CrawlTabPanelHeader
      icon={Globe}
      title={t('crawl.tabs.domain')}
      subtitle={t('crawl.domain.description')}
      trailing={
        <AppButton
          variant="cta"
          size="compact"
          label={t('crawl.domain.addSource')}
          icon={ActionIcons.add}
          disabled={saving}
          onPress={() => openSheet({ type: 'add-source' })}
        />
      }
    />
  );
}

/** Sticky Domain header + Sources/Jobs tabs — mounted in CrawlManagementScreen on mobile. */
export function CrawlDomainStickyChrome() {
  const { spacing } = useAppTheme();
  const { domainSubTab, setDomainSubTab } = useCrawlManagement();
  const subTabs = useDomainSubTabs();

  return (
    <View style={{ gap: spacing.md }}>
      <DomainHeaderBlock />
      <CrawlSegmentTabs
        tabs={subTabs}
        activeTab={domainSubTab}
        onChange={setDomainSubTab}
        variant="secondary"
        appearance="pill"
      />
    </View>
  );
}

export function CrawlDomainPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const alertRadius = surfaceRadius.card;
  const warningTone = semanticBannerTones('warning', colors);
  const { showSourceTable, showJobsTable, isNativeMobile } = useCrawlLayout();
  const {
    bundle,
    domainSubTab,
    sourceFilters,
    jobFilters,
    setDomainSubTab,
    setSourceFilters,
    setJobFilters,
    openSheet,
    openActionMenu,
    refresh,
    refreshing,
    embeddingCoverage,
    embeddingTargetOptions,
  } = useCrawlManagement();

  const subTabs = useDomainSubTabs();

  const sourceStatusOptions = useMemo(
    () => [
      { key: 'all', label: t('crawl.filters.statusAll') },
      { key: 'active', label: t('crawl.filters.statusActive') },
      { key: 'pending', label: t('crawl.filters.statusPending') },
      { key: 'inactive', label: t('crawl.filters.statusInactive') },
      { key: 'error', label: t('crawl.filters.statusError') },
    ],
    [t],
  );

  const cadenceOptions = useMemo(
    () => [
      { key: 'all', label: t('crawl.filters.cadenceAll') },
      { key: 'ONCE', label: t('crawl.filters.cadenceOnce') },
      { key: 'DAILY', label: t('crawl.filters.cadenceDaily') },
      { key: 'WEEKLY', label: t('crawl.filters.cadenceWeekly') },
    ],
    [t],
  );

  const jobStatusOptions = useMemo(
    () => [
      { key: 'all', label: t('crawl.filters.statusAll') },
      { key: 'running', label: t('crawl.jobs.status.running') },
      { key: 'completed', label: t('crawl.jobs.status.completed') },
      { key: 'failed', label: t('crawl.jobs.status.failed') },
      { key: 'pending', label: t('crawl.jobs.status.pending') },
    ],
    [t],
  );

  const filteredSources = useMemo(() => {
    if (!bundle) return [];
    return bundle.sources.filter((source) => {
      const query = sourceFilters.query.toLowerCase();
      const matchesQuery =
        !query ||
        source.name.toLowerCase().includes(query) ||
        source.base_url.toLowerCase().includes(query) ||
        source.description.toLowerCase().includes(query);
      const matchesStatus = matchesSourceStatusFilter(source, sourceFilters.status);
      const matchesCadence = sourceFilters.cadence === 'all' || source.cadence === sourceFilters.cadence;
      return matchesQuery && matchesStatus && matchesCadence;
    });
  }, [bundle, sourceFilters]);

  const crawlLimitReached = useMemo(
    () => isAtConcurrentCrawlLimit(bundle?.sources ?? [], DEFAULT_MAX_CONCURRENT_CRAWLS),
    [bundle?.sources],
  );
  const inFlightCrawlCount = useMemo(
    () => countActiveCrawlJobs(bundle?.sources ?? []),
    [bundle?.sources],
  );
  const hasActiveSourceFilters =
    sourceFilters.query !== '' || sourceFilters.status !== 'all' || sourceFilters.cadence !== 'all';
  const hasActiveJobFilters = jobFilters.query !== '' || jobFilters.status !== 'all';

  const clearJobFilters = () => {
    setJobFilters({ query: '', status: 'all' });
  };

  const openJobDetail = (sourceId: string) => {
    openSheet({ type: 'job-detail', sourceId });
  };

  const coverageBySourceId = useMemo(
    () => buildCoverageByCrawlSourceId(embeddingCoverage),
    [embeddingCoverage],
  );

  const filteredSourceRows = useMemo(
    () => expandCrawlSourcesForTable(filteredSources, coverageBySourceId, embeddingTargetOptions),
    [filteredSources, coverageBySourceId, embeddingTargetOptions],
  );

  const filteredJobSources = useMemo(() => {
    if (!bundle) return [];
    const query = jobFilters.query.toLowerCase();
    return bundle.sources.filter((source) => {
      const matchesQuery =
        !query ||
        source.name.toLowerCase().includes(query) ||
        source.base_url.toLowerCase().includes(query) ||
        source.description.toLowerCase().includes(query);
      const matchesStatus = matchesJobSourceFilter(source, jobFilters.status);
      return matchesQuery && matchesStatus;
    });
  }, [bundle, jobFilters]);

  const sourceFilterCount = countActiveFilters([sourceFilters.status, sourceFilters.cadence]);
  const jobFilterCount = countActiveFilters([jobFilters.status]);

  return (
    <View style={{ gap: spacing.md }} accessibilityLabel={t('crawl.tabs.domain')}>
      {!isNativeMobile ? (
        <>
          <DomainHeaderBlock />
          <CrawlSegmentTabs
            tabs={subTabs}
            activeTab={domainSubTab}
            onChange={setDomainSubTab}
            variant="secondary"
            appearance="pill"
          />
        </>
      ) : null}

      {domainSubTab === 'sources' ? (
        <>
          {crawlLimitReached ? (
            <View
              style={[
                styles.concurrentAlert,
                {
                  borderColor: warningTone.border,
                  backgroundColor: warningTone.bg,
                  borderRadius: alertRadius,
                  padding: spacing.sm,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.text, fontWeight: '500', marginBottom: 2 }]}>
                {t('crawl.alert.crawlLimitReached.title', { count: inFlightCrawlCount })}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
                {t('crawl.alert.crawlLimitReached.description', { count: DEFAULT_MAX_CONCURRENT_CRAWLS })}
              </Text>
            </View>
          ) : null}
          <CrawlMobileFilterSection
            activeFilterCount={sourceFilterCount}
            accessibilityLabel={t('crawl.filters.status')}
            search={
              <CrawlSearchField
                value={sourceFilters.query}
                onChangeText={(query) => setSourceFilters({ ...sourceFilters, query })}
                placeholder={t('crawl.domain.search.placeholder')}
                accessibilityLabel={t('crawl.domain.search.placeholder')}
              />
            }
            filters={
              <>
                <CrawlFilterSelect
                  accessibilityLabel={t('crawl.filters.status')}
                  value={sourceFilters.status}
                  options={sourceStatusOptions}
                  onChange={(status) =>
                    setSourceFilters({ ...sourceFilters, status: status as CrawlSourceFilterStatus })
                  }
                />
                <CrawlFilterSelect
                  accessibilityLabel={t('crawl.filters.cadence')}
                  value={sourceFilters.cadence}
                  options={cadenceOptions}
                  onChange={(cadence) =>
                    setSourceFilters({ ...sourceFilters, cadence: cadence as 'all' | CrawlCadence })
                  }
                />
                {hasActiveSourceFilters ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('crawl.filters.clear')}
                    onPress={() => setSourceFilters({ query: '', status: 'all', cadence: 'all' })}
                    style={crawlFilterClearStyle}>
                    <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>
                      {t('crawl.filters.clear')}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            }
          />
        </>
      ) : (
        <CrawlMobileFilterSection
          activeFilterCount={jobFilterCount}
          accessibilityLabel={t('crawl.jobs')}
          search={
            <CrawlSearchField
              value={jobFilters.query}
              onChangeText={(query) => setJobFilters({ ...jobFilters, query })}
              placeholder={t('crawl.jobs.search.placeholder')}
              accessibilityLabel={t('crawl.jobs.search.placeholder')}
            />
          }
          filters={
            <>
              <CrawlFilterSelect
                accessibilityLabel={t('crawl.filters.status')}
                value={jobFilters.status}
                options={jobStatusOptions}
                onChange={(status) => setJobFilters({ ...jobFilters, status: status as CrawlJobFilterStatus })}
              />
              {hasActiveJobFilters ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('crawl.filters.clear')}
                  onPress={clearJobFilters}
                  style={crawlFilterClearStyle}>
                  <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>
                    {t('crawl.filters.clear')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          }
        />
      )}

      {domainSubTab === 'sources' ? (
        <CrawlPanelCard
          title={t('crawl.table.title')}
          titleLeading={
            <AppButton
              label={t('crawl.toast.refreshed.title')}
              iconOnly
              icon={ActionIcons.refresh}
              variant="outline"
              size="compact"
              loading={refreshing}
              onPress={() => void refresh()}
            />
          }>
          {showSourceTable ? (
            <CrawlSourcesTable
              embedded
              sources={filteredSources}
              coverageBySourceId={coverageBySourceId}
              embeddingOptions={embeddingTargetOptions}
              emptyMessage={filteredSources.length === 0 ? t('crawl.table.empty') : undefined}
              onOpenMenu={(sourceId, anchor) => openActionMenu({ kind: 'source', sourceId, anchor })}
              onPressSource={(sourceId) => openSheet({ type: 'edit-source', sourceId })}
            />
          ) : filteredSources.length === 0 ? (
            <EmptyStateView title={t('crawl.table.empty')} variant="inline" />
          ) : (
            <View style={{ gap: spacing.xs }} accessibilityRole="list">
              {filteredSourceRows.map((row) => (
                <CrawlSourceRow
                  key={row.rowKey}
                  source={row.source}
                  coverageEntry={coverageBySourceId.get(row.source.id)}
                  embeddingOptions={embeddingTargetOptions}
                  modelLabels={row.modelLabels}
                  onOpenMenu={(anchor) => openActionMenu({ kind: 'source', sourceId: row.source.id, anchor })}
                  onPress={() => openSheet({ type: 'edit-source', sourceId: row.source.id })}
                />
              ))}
            </View>
          )}
        </CrawlPanelCard>
      ) : (
        <View style={[styles.jobsContentRow]}>
          <View style={styles.jobsListColumn}>
            <CrawlPanelCard title={t('crawl.jobs.title')}>
              {showJobsTable ? (
                <CrawlJobsTable
                  embedded
                  sources={filteredJobSources}
                  coverageBySourceId={coverageBySourceId}
                  embeddingOptions={embeddingTargetOptions}
                  emptyMessage={filteredJobSources.length === 0 ? t('crawl.jobs.empty') : undefined}
                  onPressSource={openJobDetail}
                />
              ) : filteredJobSources.length === 0 ? (
                <EmptyStateView title={t('crawl.jobs.empty')} variant="inline" />
              ) : (
                <View accessibilityRole="list">
                  {filteredJobSources.map((source, index) => (
                    <CrawlJobRow
                      key={source.id}
                      source={source}
                      coverageEntry={coverageBySourceId.get(source.id)}
                      embeddingOptions={embeddingTargetOptions}
                      layout="card"
                      embedded
                      isLast={index === filteredJobSources.length - 1}
                      onPress={() => openJobDetail(source.id)}
                    />
                  ))}
                </View>
              )}
            </CrawlPanelCard>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  jobsContentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  jobsListColumn: {
    flex: 1,
    minWidth: 0,
  },
  concurrentAlert: {
    borderWidth: 1,
  },
});
