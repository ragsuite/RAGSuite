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
                : column.key === 'depth'
                  ? styles.depthCell
                  : column.key === 'cadence'
                    ? styles.cadenceCell
                    : column.key === 'headless'
                      ? styles.headlessCell
                      : column.key === 'status'
                        ? styles.statusCell
                        : column.key === 'training'
                          ? styles.trainingCell
                          : column.key === 'lastCrawl'
                            ? styles.lastCrawlCell
                            : column.key === 'links'
                              ? styles.linksCell
                              : column.key === 'actions'
                                ? styles.actionCell
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
  cell: {
    justifyContent: 'center',
  },
  headerLabel: {
    width: '100%',
  },
  urlCell: {
    flex: CRAWL_SOURCE_TABLE.urlFlex,
    minWidth: CRAWL_SOURCE_TABLE.urlMinWidth,
    flexShrink: 1,
  },
  modelCell: {
    flex: CRAWL_SOURCE_TABLE.modelFlex,
    minWidth: CRAWL_SOURCE_TABLE.modelMinWidth,
    flexShrink: 1,
    alignItems: 'center',
  },
  depthCell: {
    width: CRAWL_SOURCE_TABLE.depthWidth,
    flexShrink: 0,
  },
  cadenceCell: {
    width: CRAWL_SOURCE_TABLE.cadenceWidth,
    flexShrink: 0,
  },
  headlessCell: {
    width: CRAWL_SOURCE_TABLE.headlessWidth,
    flexShrink: 0,
  },
  statusCell: {
    width: CRAWL_SOURCE_TABLE.statusWidth,
    flexShrink: 0,
  },
  trainingCell: {
    flex: CRAWL_SOURCE_TABLE.trainingFlex,
    minWidth: CRAWL_SOURCE_TABLE.trainingMinWidth,
    flexShrink: 1,
  },
  lastCrawlCell: {
    flex: CRAWL_SOURCE_TABLE.lastCrawlFlex,
    minWidth: CRAWL_SOURCE_TABLE.lastCrawlMinWidth,
    flexShrink: 1,
  },
  linksCell: {
    width: CRAWL_SOURCE_TABLE.linksWidth,
    flexShrink: 0,
    alignItems: 'center',
  },
  actionCell: {
    width: CRAWL_SOURCE_TABLE.actionWidth,
    flexShrink: 0,
  },
});
