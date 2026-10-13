import React from 'react';

import { CrawlSourceCardRow } from '@/features/crawl/components/CrawlSourceCardRow';
import { CrawlSourceTableRow } from '@/features/crawl/components/CrawlSourceTableRow';
import { SourceAnswersSwitch } from '@/features/crawl/components/SourceAnswersSwitch';
import type { SourceAnswersChange } from '@/features/crawl/hooks/use-source-answers-toggle';
import type {
  CrawlEmbeddingTargetOptions,
  CrawlMenuAnchor,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import {
  displaySourceStatus,
  getSourceStatusTone,
  shouldShowCrawlProgress,
  sourceAnswersLockReason,
  sourceIsTrained,
  sourceUsedInAnswers,
} from '@/features/crawl/utils/crawl.utils';
import { resolveCrawlSourceModelLabels } from '@/features/crawl/utils/crawl-embedding-display';
import { useTranslation } from '@/i18n';

type Props = {
  source: CrawlSource;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  layout?: 'card' | 'table';
  isLast?: boolean;
  modelLabels?: string[];
  showCoverageWarning?: boolean;
  onOpenMenu: (anchor?: CrawlMenuAnchor) => void;
  onPress?: () => void;
  onAnswersChange?: SourceAnswersChange;
};

export function CrawlSourceRow({
  source,
  coverageEntry,
  embeddingOptions,
  layout = 'card',
  isLast,
  modelLabels,
  showCoverageWarning = true,
  onOpenMenu,
  onPress,
  onAnswersChange,
}: Props) {
  const { t } = useTranslation();
  const isCompact = useCrawlCompactLayout();

  const viewProps = {
    source,
    coverageEntry,
    embeddingOptions,
    isLast,
    modelLabels: modelLabels ?? resolveCrawlSourceModelLabels(source, coverageEntry, embeddingOptions),
    trained: sourceIsTrained(source),
    statusLabel: displaySourceStatus(source, t),
    statusTone: getSourceStatusTone(source),
    showProgress: shouldShowCrawlProgress(source),
    progressValue: source.progress_percentage ?? 0,
    showCoverageWarning,
    answersSwitch: onAnswersChange ? (
      <SourceAnswersSwitch
        sourceId={source.id}
        name={source.name || source.base_url}
        usedInAnswers={sourceUsedInAnswers(source)}
        lockReason={sourceAnswersLockReason(source)}
        onChange={onAnswersChange}
      />
    ) : null,
    onOpenMenu,
    onPress,
  };

  return layout === 'table' && !isCompact ? (
    <CrawlSourceTableRow {...viewProps} />
  ) : (
    <CrawlSourceCardRow {...viewProps} />
  );
}
