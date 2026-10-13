import { StyleSheet } from 'react-native';

import { CRAWL_SOURCE_TABLE } from '@/features/crawl/utils/crawl-layout';

export type CrawlSourceColumnKey =
  | 'source'
  | 'model'
  | 'crawl'
  | 'status'
  | 'training'
  | 'links'
  | 'answers'
  | 'actions';

export type CrawlSourceColumn = {
  key: CrawlSourceColumnKey;
  /** i18n key; omitted for the unlabeled action column. */
  labelKey?: string;
  align: 'left' | 'center';
};

/** Header and rows render from this list so their cells can never drift apart. */
export const CRAWL_SOURCE_COLUMNS: readonly CrawlSourceColumn[] = [
  { key: 'source', labelKey: 'crawl.table.col.source', align: 'left' },
  { key: 'model', labelKey: 'crawl.table.col.model', align: 'left' },
  { key: 'crawl', labelKey: 'crawl.table.col.crawl', align: 'left' },
  { key: 'status', labelKey: 'crawl.table.col.status', align: 'left' },
  { key: 'training', labelKey: 'crawl.table.col.training', align: 'left' },
  { key: 'links', labelKey: 'crawl.table.col.links', align: 'center' },
  { key: 'answers', labelKey: 'crawl.table.col.answers', align: 'center' },
  { key: 'actions', align: 'center' },
];

export const crawlSourceColumnStyles = StyleSheet.create({
  source: {
    flex: CRAWL_SOURCE_TABLE.urlFlex,
    minWidth: CRAWL_SOURCE_TABLE.urlMinWidth,
    flexShrink: 1,
  },
  model: {
    flex: CRAWL_SOURCE_TABLE.modelFlex,
    minWidth: CRAWL_SOURCE_TABLE.modelMinWidth,
    flexShrink: 1,
    overflow: 'hidden',
  },
  crawl: {
    flex: CRAWL_SOURCE_TABLE.crawlFlex,
    minWidth: CRAWL_SOURCE_TABLE.crawlMinWidth,
    flexShrink: 1,
  },
  status: {
    width: CRAWL_SOURCE_TABLE.statusWidth,
    flexShrink: 0,
  },
  training: {
    flex: CRAWL_SOURCE_TABLE.trainingFlex,
    minWidth: CRAWL_SOURCE_TABLE.trainingMinWidth,
    flexShrink: 1,
  },
  links: {
    width: CRAWL_SOURCE_TABLE.linksWidth,
    flexShrink: 0,
    alignItems: 'center',
  },
  answers: {
    width: CRAWL_SOURCE_TABLE.answersWidth,
    flexShrink: 0,
    alignItems: 'center',
  },
  actions: {
    width: CRAWL_SOURCE_TABLE.actionWidth,
    flexShrink: 0,
    alignItems: 'center',
  },
});
