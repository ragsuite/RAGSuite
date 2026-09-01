import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';

export type EmbeddingStatusNamespace = 'chatbot' | 'search';

export type EmbeddingStatusSummaryVariant = 'ok' | 'needs-reindex' | 'empty';

export type EmbeddingStatusSummaryLineKind =
  | 'coverage'
  | 'missing'
  | 'projectCrawl'
  | 'vectors';

export type EmbeddingStatusSummaryLine = {
  kind: EmbeddingStatusSummaryLineKind;
  text: string;
};

type TranslateFn = (key: string, options?: Record<string, string | number>) => string;

function uploadsInScope(status: EmbeddingStatus): number {
  const expectedCrawl = status.crawl_sources_expected ?? 0;
  return Math.max(0, status.coverage_items_total - expectedCrawl);
}

export function buildEmbeddingStatusSummaryLines(
  status: EmbeddingStatus,
  namespace: EmbeddingStatusNamespace,
  variant: EmbeddingStatusSummaryVariant,
  t: TranslateFn,
): EmbeddingStatusSummaryLine[] {
  const prefix = `${namespace}.embedding.status.summary`;
  const lines: EmbeddingStatusSummaryLine[] = [];

  if (variant === 'empty') {
    return lines;
  }

  lines.push({
    kind: 'coverage',
    text: t(`${prefix}.coverage`, {
      embedded: status.coverage_items_embedded,
      total: status.coverage_items_total,
      model: status.active_model,
    }),
  });

  if (variant === 'needs-reindex') {
    lines.push({
      kind: 'missing',
      text: t(`${prefix}.missing`, {
        missing: status.coverage_items_missing,
        missingCrawl: status.missing_crawl_sources_count,
        missingUploads: status.missing_uploaded_count,
        model: status.active_model,
      }),
    });
  }

  const crawlTotal = status.crawl_sources_total ?? 0;
  const crawlExpected = status.crawl_sources_expected ?? 0;
  const crawlOther = status.crawl_sources_other_surface ?? 0;
  const uploads = uploadsInScope(status);

  if (crawlTotal > 0) {
    lines.push({
      kind: 'projectCrawl',
      text: t(`${prefix}.projectCrawl`, {
        total: crawlTotal,
        expected: crawlExpected,
        other: crawlOther,
        uploads,
      }),
    });
  }

  lines.push({
    kind: 'vectors',
    text: t(`${prefix}.vectors`, {
      count: status.active_vectors.toLocaleString(),
      model: status.active_model,
    }),
  });

  return lines;
}

export function embeddingStatusSummaryTitleKey(
  namespace: EmbeddingStatusNamespace,
  variant: EmbeddingStatusSummaryVariant,
): string {
  if (variant === 'empty') {
    return namespace === 'search'
      ? `${namespace}.embedding.status.emptyIndexed.title`
      : `${namespace}.embedding.status.empty.title`;
  }
  if (variant === 'needs-reindex') {
    return `${namespace}.embedding.status.needsReindex.title`;
  }
  return `${namespace}.embedding.status.allEmbedded.title`;
}

export function embeddingStatusSummaryEmptyBodyKey(
  namespace: EmbeddingStatusNamespace,
): string {
  return namespace === 'search'
    ? `${namespace}.embedding.status.emptyIndexed.body`
    : `${namespace}.embedding.status.empty.body`;
}
