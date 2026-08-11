import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSticky } from '@/shared/utils/web-sticky';

type Props = {
  preview: React.ReactNode;
  form: React.ReactNode;
};

export function SearchConfigPreviewLayout({ preview, form }: Props) {
  const { spacing } = useAppTheme();
  const { isCompact } = useSearchConfigLayout();

  if (isCompact) {
    return (
      <View style={{ gap: spacing.lg }}>
        <View style={styles.block}>{form}</View>
        <View style={styles.block}>{preview}</View>
      </View>
    );
  }

  return (
    <View style={[styles.split, { gap: spacing.lg }]}>
      <View style={styles.formCol}>{form}</View>
      <View style={[styles.previewCol, webSticky(8)]}>{preview}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  formCol: {
    flex: 1.15,
    minWidth: 0,
    maxWidth: 560,
  },
  previewCol: {
    flex: 1,
    minWidth: 300,
    maxWidth: 480,
  },
  block: {
    width: '100%',
  },
});
