import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Row = {
  key: string;
  value: string;
};

type Props = {
  rows: Row[];
};

export function ChatHistoryKeyValueTable({ rows }: Props) {
  const { colors, spacing, typography, fonts } = useAppTheme();

  if (rows.length === 0) return null;

  return (
    <View style={styles.table}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={[
            styles.row,
            {
              paddingVertical: spacing.sm,
              borderBottomColor: colors.border,
              borderBottomWidth: index < rows.length - 1 ? StyleSheet.hairlineWidth : 0,
            },
          ]}>
          <Text style={[typography.caption, styles.key, { color: colors.textMuted }]}>{row.key}</Text>
          <Text
            style={[
              typography.body,
              styles.value,
              {
                color: colors.text,
                fontWeight: '500',
                fontFamily: fonts.mono,
              },
            ]}
            selectable
            numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  key: {
    flex: 1,
    minWidth: 0,
  },
  value: {
    flexShrink: 0,
    textAlign: 'right',
    maxWidth: '60%',
  },
});
