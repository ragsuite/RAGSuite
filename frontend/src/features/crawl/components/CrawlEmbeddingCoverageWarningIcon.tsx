import React from 'react';
import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import type { CrawlEmbeddingTargetOptions, CrawlSource } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { shouldShowCrawlEmbeddingCoverageWarning } from '@/features/crawl/utils/crawl-embedding-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  source: CrawlSource;
  entry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  size?: number;
};

export function CrawlEmbeddingCoverageWarningIcon({
  source,
  entry,
  embeddingOptions,
  size = 16,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  if (!shouldShowCrawlEmbeddingCoverageWarning(source, entry, embeddingOptions)) return null;

  return (
    <View accessibilityLabel={t('documents.embedding.missingActiveA11y')}>
      <AlertTriangle size={size} color={colors.warning} />
    </View>
  );
}
