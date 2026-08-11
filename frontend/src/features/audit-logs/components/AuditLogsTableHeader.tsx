import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { getAuditTableColumns } from '@/features/audit-logs/utils/audit-log-options';
import { useTranslation } from '@/i18n';
import { TableHeaderLabel } from '@/shared/components/brand';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function AuditLogsTableHeader() {
  const { colors, spacing, isWebParitySurfaces } = useAppTheme();
  const { t } = useTranslation();
  const columns = useMemo(() => getAuditTableColumns(t), [t]);

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          paddingVertical: isWebParitySurfaces ? 0 : 10,
          paddingHorizontal: isWebParitySurfaces ? spacing.md : 10,
          minHeight: isWebParitySurfaces ? 48 : undefined,
        },
      ]}>
      {columns.map((col) => (
        <TableHeaderLabel
          key={col.key}
          style={{
            flex: col.flex,
            minWidth: col.minWidth,
            flexShrink: 1,
          }}>
          {col.label}
        </TableHeaderLabel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    flexWrap: 'nowrap',
    minWidth: 760,
  },
});
