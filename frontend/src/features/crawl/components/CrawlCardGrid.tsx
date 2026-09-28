import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { useCrawlLayout } from '@/features/crawl/hooks/useCrawlLayout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const GRID_ITEM_HALF = Platform.select({
  web: { width: 'calc(50% - 8px)', maxWidth: 'calc(50% - 8px)' },
  default: { flexBasis: '48%', maxWidth: '48%' },
}) as ViewStyle;

const GRID_ITEM_THIRD = Platform.select({
  web: { width: 'calc(33.333% - 11px)', maxWidth: 'calc(33.333% - 11px)' },
  default: { flexBasis: '31%', maxWidth: '31%' },
}) as ViewStyle;

type Props<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
};

/** Responsive 1 / 2 / 3 column card grid shared by the Document, Text and Q&A tabs. */
export function CrawlCardGrid<T>({ items, keyExtractor, renderItem }: Props<T>) {
  const { spacing } = useAppTheme();
  const { width } = useCrawlLayout();
  const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  const columnStyle = columns === 3 ? GRID_ITEM_THIRD : columns === 2 ? GRID_ITEM_HALF : null;

  return (
    <View style={[styles.grid, { gap: spacing.md }]} accessibilityRole="list">
      {items.map((item) => (
        <View key={keyExtractor(item)} style={[styles.gridItem, columnStyle]}>
          {renderItem(item)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
});
