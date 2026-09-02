import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { CrawlJobRow } from '@/features/crawl/components/CrawlJobRow';
import { CrawlJobsTableHeader } from '@/features/crawl/components/CrawlJobsTableHeader';
import { useCrawlLayout } from '@/features/crawl/hooks/useCrawlLayout';
import type { CrawlEmbeddingTargetOptions, CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type CrawlJobTableRow = {
  job: CrawlJob;
  source: CrawlSource;
};

type Props = {
  rows: CrawlJobTableRow[];
  coverageBySourceId?: Map<string, ItemEmbeddingCoverageEntry>;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  onPressSource: (sourceId: string) => void;
  embedded?: boolean;
  emptyMessage?: string;
};

export function CrawlJobsTable({ rows, coverageBySourceId, embeddingOptions, onPressSource, embedded = false, emptyMessage }: Props) {
  const { colors } = useAppTheme();
  const { useJobsTableHorizontalScroll, tableMinWidth } = useCrawlLayout();

  const table = (
    <View
      style={[
        styles.shell,
        embedded ? styles.shellEmbedded : null,
        useJobsTableHorizontalScroll ? { minWidth: tableMinWidth } : null,
        !embedded ? { borderColor: colors.border } : null,
      ]}
      accessibilityRole="list">
      <CrawlJobsTableHeader />
      {rows.length === 0 && emptyMessage ? (
        <EmptyStateView title={emptyMessage} variant="inline" compact />
      ) : (
        rows.map(({ job, source }, index) => (
          <CrawlJobRow
            key={job.id}
            job={job}
            source={source}
            coverageEntry={coverageBySourceId?.get(source.id)}
            embeddingOptions={embeddingOptions}
            layout="table"
            embedded={embedded}
            isLast={index === rows.length - 1}
            onPress={() => onPressSource(source.id)}
          />
        ))
      )}
    </View>
  );

  if (useJobsTableHorizontalScroll) {
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
