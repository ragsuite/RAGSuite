import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CRAWL_JOB_ROW } from '@/features/crawl/utils/crawl-layout';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlJobsTableHeader() {
  const { t } = useTranslation();
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();

  const webColumns = useMemo(
    () =>
      [
        { key: 'job', label: t('crawl.jobs'), align: 'left' as const },
        { key: 'status', label: t('crawl.filters.status'), align: 'center' as const },
        { key: 'pages', label: t('crawl.table.col.links'), align: 'left' as const },
        { key: 'finished', label: t('crawl.table.col.lastCrawl'), align: 'left' as const },
        { key: 'actions', label: '', align: 'left' as const },
      ] as const,
    [t],
  );

  return (
    <View
      style={[
        styles.header,
        {
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          paddingVertical: isWebParitySurfaces ? 0 : spacing.sm,
          minHeight: isWebParitySurfaces ? 48 : undefined,
          gap: CRAWL_JOB_ROW.rowGap,
        },
      ]}>
      {webColumns.map((column) => (
        <View
          key={column.key}
          style={[
            column.key === 'job'
              ? styles.jobCell
              : column.key === 'pages'
                ? styles.pagesCell
                : column.key === 'finished'
                  ? styles.finishedCell
                  : column.key === 'actions'
                    ? styles.actionCell
                    : column.key === 'status'
                      ? styles.statusCell
                      : undefined,
          ]}>
          {column.label ? (
            <TableHeaderLabel align={column.align} style={styles.headerLabel}>
              {column.label}
            </TableHeaderLabel>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  headerLabel: {
    width: '100%',
  },
  jobCell: {
    flex: CRAWL_JOB_ROW.identityFlex,
    minWidth: CRAWL_JOB_ROW.identityMinWidth,
    maxWidth: CRAWL_JOB_ROW.identityMaxWidth,
    flexShrink: 1,
  },
  statusCell: {
    width: CRAWL_JOB_ROW.statusWidth,
    flexShrink: 0,
  },
  pagesCell: {
    flex: CRAWL_JOB_ROW.pagesFlex,
    minWidth: CRAWL_JOB_ROW.pagesMinWidth,
    flexShrink: 1,
  },
  finishedCell: {
    flex: CRAWL_JOB_ROW.finishedFlex,
    minWidth: CRAWL_JOB_ROW.finishedMinWidth,
    flexShrink: 1,
  },
  actionCell: {
    width: CRAWL_JOB_ROW.chevronWidth,
    flexShrink: 0,
  },
});
