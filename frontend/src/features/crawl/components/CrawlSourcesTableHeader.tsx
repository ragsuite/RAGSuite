import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CRAWL_SOURCE_TABLE } from '@/features/crawl/utils/crawl-layout';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlSourcesTableHeader() {
  const { t } = useTranslation();
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();

  const webColumns = useMemo(
    () =>
      [
        { key: 'url', label: t('crawl.table.col.url') },
        { key: 'depth', label: t('crawl.table.col.depth') },
        { key: 'cadence', label: t('crawl.table.col.cadence') },
        { key: 'headless', label: t('crawl.table.col.headless') },
        { key: 'status', label: t('crawl.table.col.status') },
        { key: 'training', label: t('crawl.table.col.training') },
        { key: 'lastCrawl', label: t('crawl.table.col.lastCrawl') },
        { key: 'links', label: t('crawl.table.col.links') },
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
          gap: CRAWL_SOURCE_TABLE.rowGap,
        },
      ]}>
      {webColumns.map((column) => (
        <TableHeaderLabel
          key={column.key}
          style={[
            styles.cell,
            column.key === 'url' ? styles.urlCell : column.key === 'actions' ? styles.actionCell : undefined,
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
    minWidth: CRAWL_SOURCE_TABLE.metricMinWidth,
  },
  urlCell: {
    flex: CRAWL_SOURCE_TABLE.urlFlex,
    minWidth: CRAWL_SOURCE_TABLE.urlMinWidth,
  },
  actionCell: {
    minWidth: CRAWL_SOURCE_TABLE.actionWidth,
    width: CRAWL_SOURCE_TABLE.actionWidth,
  },
});
