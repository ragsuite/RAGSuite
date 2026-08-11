import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CRAWL_DOCUMENT_LIST } from '@/features/crawl/utils/crawl-layout';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function CrawlDocumentListHeader() {
  const { colors, spacing } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingHorizontal: spacing.md,
          gap: CRAWL_DOCUMENT_LIST.rowGap,
        },
      ]}>
      <View style={{ width: CRAWL_DOCUMENT_LIST.checkboxColumnWidth, flexShrink: 0 }} />
      <View style={{ width: CRAWL_DOCUMENT_LIST.iconWidth, flexShrink: 0 }} />
      <TableHeaderLabel style={[styles.nameCell, { flex: 1 }]}>
        {t('documents.list.column.document')}
      </TableHeaderLabel>
      <TableHeaderLabel style={[styles.metaCell, { minWidth: CRAWL_DOCUMENT_LIST.metaMinWidth }]}>
        {t('documents.list.column.size')}
      </TableHeaderLabel>
      <TableHeaderLabel style={[styles.badgesCell, { minWidth: CRAWL_DOCUMENT_LIST.badgesMinWidth }]}>
        {t('documents.list.column.typeStatus')}
      </TableHeaderLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  nameCell: {
    minWidth: 0,
  },
  metaCell: {
    textAlign: 'right',
    flexShrink: 0,
  },
  badgesCell: {
    textAlign: 'right',
    flexShrink: 0,
  },
});
