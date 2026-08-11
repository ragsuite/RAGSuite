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
        { key: 'job', label: t('crawl.jobs') },
        { key: 'status', label: t('crawl.filters.status') },
        { key: 'pages', label: t('crawl.table.col.links') },
        { key: 'finished', label: t('crawl.table.col.lastCrawl') },
        { key: 'actions', label: '' },
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
        <TableHeaderLabel
          key={column.key}
          style={[
            styles.cell,
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
          {column.label}
        </TableHeaderLabel>
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
  cell: {
    minWidth: CRAWL_JOB_ROW.metricsMinWidth,
  },
  jobCell: {
    flex: CRAWL_JOB_ROW.identityFlex,
    minWidth: CRAWL_JOB_ROW.identityMinWidth,
  },
  statusCell: {
    width: CRAWL_JOB_ROW.statusWidth,
  },
  pagesCell: {
    width: CRAWL_JOB_ROW.pagesWidth,
  },
  finishedCell: {
    flex: CRAWL_JOB_ROW.finishedFlex,
    minWidth: CRAWL_JOB_ROW.finishedMinWidth,
  },
  actionCell: {
    minWidth: CRAWL_JOB_ROW.chevronWidth,
    width: CRAWL_JOB_ROW.chevronWidth,
  },
});
