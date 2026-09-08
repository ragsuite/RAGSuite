import type {
  CrawlEmbeddingTargetOptions,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import {
  formatCrawlEmbeddedModelLabel,
  isEmbeddingDestinationPending,
  projectTargetCollection,
  resolvePersistedIngestTarget,
} from '@/features/crawl/utils/crawl-embedding-display';

export type ManualRecrawlConfirmKind = 'same' | 'switch';

export type ManualRecrawlConfirmContent = {
  kind: ManualRecrawlConfirmKind;
  indexedModelLabel: string | null;
  configuredModelLabel: string | null;
};

type TranslateFn = (key: string, options?: Record<string, string>) => string;

function labelForTarget(
  target: 'search' | 'chat',
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): string | null {
  if (!embeddingOptions) return null;
  const entry = target === 'search' ? embeddingOptions.search : embeddingOptions.chat;
  if (!entry?.provider && !entry?.model) return null;
  return formatCrawlEmbeddedModelLabel({
    provider: entry.provider,
    model: entry.model,
    collection: entry.collection,
  });
}

function primaryIndexedModelLabel(
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
): string | null {
  const models = coverageEntry?.embedded_models ?? [];
  if (!models.length) return null;
  const first = models[0];
  return formatCrawlEmbeddedModelLabel({
    provider: first.provider,
    model: first.model,
    collection: first.collection,
  });
}

/** True when coverage has vectors outside the configured destination collection. */
function coverageHasOffTargetCollections(
  target: 'search' | 'chat' | null,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): boolean {
  if (!target || !embeddingOptions) return false;
  const destination = projectTargetCollection(target, embeddingOptions);
  if (!destination) return false;
  const models = coverageEntry?.embedded_models ?? [];
  if (!models.length) return false;
  return models.some((m) => m.collection && m.collection !== destination);
}

/** Classify Start Crawl confirm: same destination vs model/destination switch. */
export function resolveManualRecrawlConfirmContent(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): ManualRecrawlConfirmContent {
  const target = resolvePersistedIngestTarget(source, embeddingOptions);
  const configuredModelLabel = target ? labelForTarget(target, embeddingOptions) : null;
  const indexedModelLabel = primaryIndexedModelLabel(coverageEntry);
  const destinationPending = isEmbeddingDestinationPending(
    source,
    coverageEntry,
    embeddingOptions,
  );
  const offTarget = coverageHasOffTargetCollections(target, coverageEntry, embeddingOptions);

  if ((offTarget || destinationPending) && indexedModelLabel) {
    return {
      kind: 'switch',
      indexedModelLabel,
      configuredModelLabel,
    };
  }

  return {
    kind: 'same',
    indexedModelLabel,
    configuredModelLabel,
  };
}

export function buildManualRecrawlConfirmCopy(
  content: ManualRecrawlConfirmContent,
  t: TranslateFn,
): { title: string; message: string } {
  if (content.kind === 'switch') {
    return {
      title: t('crawl.confirm.recrawl.switch.title'),
      message: t('crawl.confirm.recrawl.switch.message', {
        indexedModel: content.indexedModelLabel ?? '—',
        configuredModel: content.configuredModelLabel ?? '—',
      }),
    };
  }

  // Same destination: claim only the actual indexed model, never the configured-but-unwritten one.
  const model = content.indexedModelLabel ?? content.configuredModelLabel ?? '';
  return {
    title: t('crawl.confirm.recrawl.title'),
    message: model
      ? t('crawl.confirm.recrawl.messageWithModel', { model })
      : t('crawl.confirm.recrawl.message'),
  };
}
