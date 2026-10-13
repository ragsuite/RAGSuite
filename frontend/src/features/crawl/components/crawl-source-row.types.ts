import type { ReactNode } from 'react';

import type {
  CrawlEmbeddingTargetOptions,
  CrawlMenuAnchor,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { getSourceStatusTone } from '@/features/crawl/utils/crawl.utils';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';

/** Values `CrawlSourceRow` derives once and hands to its table / card layouts. */
export type CrawlSourceRowViewProps = {
  source: CrawlSource;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  isLast?: boolean;
  modelLabels: string[];
  trained: boolean;
  statusLabel: string;
  statusTone: ReturnType<typeof getSourceStatusTone>;
  showProgress: boolean;
  progressValue: number;
  showCoverageWarning: boolean;
  answersSwitch: ReactNode;
  onOpenMenu: (anchor?: CrawlMenuAnchor) => void;
  onPress?: () => void;
};
