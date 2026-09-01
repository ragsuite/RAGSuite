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
        { key: 'url', label: t('crawl.table.col.url'), align: 'left' as const },
        { key: 'model', label: t('crawl.table.col.model'), align: 'center' as const },
        { key: 'depth', label: t('crawl.table.col.depth'), align: 'left' as const },
        { key: 'cadence', label: t('crawl.table.col.cadence'), align: 'left' as const },
        { key: 'headless', label: t('crawl.table.col.headless'), align: 'left' as const },
        { key: 'status', label: t('crawl.table.col.status'), align: 'left' as const },
        { key: 'training', label: t('crawl.table.col.training'), align: 'left' as const },
        { key: 'lastCrawl', label: t('crawl.table.col.lastCrawl'), align: 'left' as const },
        { key: 'links', label: t('crawl.table.col.links'), align: 'center' as const },
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
          gap: CRAWL_SOURCE_TABLE.rowGap,
        },
      ]}>
      {webColumns.map((column) => (
        <View
          key={column.key}
          style={[
            styles.cell,
            column.key === 'url'
              ? styles.urlCell
              : column.key === 'model'
                ? styles.modelCell
                : column.key === 'links'
                  ? styles.linksCell
                  : column.key === 'actions'
                    ? styles.actionCell
                    : undefined,
          ]}>
          <TableHeaderLabel align={column.align} style={styles.headerLabel}>
            {column.label}
          </TableHeaderLabel>
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
  cell: {
    minWidth: CRAWL_SOURCE_TABLE.metricMinWidth,
    justifyContent: 'center',
  },
  headerLabel: {
    width: '100%',
  },
  urlCell: {
    flex: CRAWL_SOURCE_TABLE.urlFlex,
    minWidth: CRAWL_SOURCE_TABLE.urlMinWidth,
  },
  modelCell: {
    minWidth: CRAWL_SOURCE_TABLE.modelMinWidth,
    flex: 1.1,
    alignItems: 'center',
  },
  linksCell: {
    minWidth: CRAWL_SOURCE_TABLE.metricMinWidth,
    alignItems: 'center',
  },
  actionCell: {
    minWidth: CRAWL_SOURCE_TABLE.actionWidth,
    width: CRAWL_SOURCE_TABLE.actionWidth,
  },
});
