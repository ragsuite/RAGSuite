import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { CrawlSourceRow } from '@/features/crawl/components/CrawlSourceRow';
import { CrawlSourcesTableHeader } from '@/features/crawl/components/CrawlSourcesTableHeader';
import { useCrawlLayout } from '@/features/crawl/hooks/useCrawlLayout';
import type { CrawlMenuAnchor, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  sources: CrawlSource[];
  coverageBySourceId?: Map<string, ItemEmbeddingCoverageEntry>;
  onOpenMenu: (sourceId: string, anchor?: CrawlMenuAnchor) => void;
  onPressSource: (sourceId: string) => void;
  embedded?: boolean;
  emptyMessage?: string;
};

export function CrawlSourcesTable({ sources, coverageBySourceId, onOpenMenu, onPressSource, embedded = false, emptyMessage }: Props) {
  const { colors } = useAppTheme();
  const { useTableHorizontalScroll, tableMinWidth } = useCrawlLayout();

  const table = (
    <View
      style={[
        styles.shell,
        embedded ? styles.shellEmbedded : null,
        useTableHorizontalScroll ? { minWidth: tableMinWidth } : null,
        !embedded
          ? {
              borderColor: colors.border,
            }
          : null,
      ]}
      accessibilityRole="list">
      <CrawlSourcesTableHeader />
      {sources.length === 0 && emptyMessage ? (
        <EmptyStateView title={emptyMessage} variant="inline" compact />
      ) : (
        sources.map((source, index) => (
          <CrawlSourceRow
            key={source.id}
            source={source}
            coverageEntry={coverageBySourceId?.get(source.id)}
            layout="table"
            isLast={index === sources.length - 1}
            onOpenMenu={(anchor) => onOpenMenu(source.id, anchor)}
            onPress={() => onPressSource(source.id)}
          />
        ))
      )}
    </View>
  );

  if (useTableHorizontalScroll) {
    return (
      <AppScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={styles.scrollContent}>
        {table}
      </AppScrollView>
    );
  }

  return table;
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  shellEmbedded: {
    borderWidth: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
