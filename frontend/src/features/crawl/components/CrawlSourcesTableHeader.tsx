import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CRAWL_SOURCE_TABLE } from '@/features/crawl/utils/crawl-layout';
import { CRAWL_SOURCE_COLUMNS, crawlSourceColumnStyles } from '@/features/crawl/utils/crawl-source-columns';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlSourcesTableHeader() {
  const { t } = useTranslation();
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();

  return (
    <View
      style={[
        styles.header,
        {
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingVertical: isWebParitySurfaces ? 0 : spacing.sm,
          minHeight: isWebParitySurfaces ? 48 : undefined,
        },
      ]}>
      {CRAWL_SOURCE_COLUMNS.map((column) => (
        <View key={column.key} style={[styles.cell, crawlSourceColumnStyles[column.key]]}>
          {column.labelKey ? (
            <TableHeaderLabel align={column.align} style={styles.headerLabel}>
              {t(column.labelKey)}
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
    paddingHorizontal: CRAWL_SOURCE_TABLE.edgePadding,
    gap: CRAWL_SOURCE_TABLE.rowGap,
  },
  cell: {
    justifyContent: 'center',
  },
  headerLabel: {
    width: '100%',
  },
});
