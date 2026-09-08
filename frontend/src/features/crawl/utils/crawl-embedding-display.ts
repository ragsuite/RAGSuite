import type {
  CrawlEmbeddedModel,
  CrawlEmbeddingTargetOptions,
  CrawlIngestEmbeddingTarget,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { sourceIsTrained } from '@/features/crawl/utils/crawl.utils';

export type CrawlSourceTableRow = {
  rowKey: string;
  source: CrawlSource;
  modelLabels: string[];
};

export type CrawlIngestSurfaceTag = 'chat' | 'search' | 'both';

type CoverageModel = {
  provider?: string | null;
  model?: string | null;
  collection: string;
  source?: 'search' | 'chat' | null;
};

type SingleIngestTarget = 'search' | 'chat';

export function resolvePersistedIngestTarget(
  source: CrawlSource,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): SingleIngestTarget | null {
  const fromDb = source.ingest_embedding_target;
  if (fromDb === 'search' || fromDb === 'chat') return fromDb;
  return resolveEffectiveIngestTarget(source, embeddingOptions);
}

export function resolveCrawlSourceSurfaceTag(
  source: CrawlSource,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
  rowSurface?: 'search' | 'chat',
): CrawlIngestSurfaceTag | null {
  if (rowSurface === 'search' || rowSurface === 'chat') {
    return rowSurface;
  }

  const ingestTarget = source.ingest_embedding_target;
  if (ingestTarget === 'chat') return 'chat';
  if (ingestTarget === 'search') return 'search';
  if (ingestTarget === 'both') return 'both';

  if (ingestTarget == null) return 'both';

  return null;
}

export function resolveEffectiveIngestTarget(
  source: CrawlSource,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): SingleIngestTarget | null {
  const fromDb = source.ingest_embedding_target;
  if (fromDb === 'search' || fromDb === 'chat') return fromDb;

  const configured = source.indexed_embedding_models ?? [];
  const tagged = configured.find((m) => m.source === 'search' || m.source === 'chat');
  if (tagged?.source === 'search' || tagged?.source === 'chat') return tagged.source;

  const primary = configured[0];
  if (primary?.collection && embeddingOptions) {
    if (primary.collection === embeddingOptions.search.collection) return 'search';
    if (primary.collection === embeddingOptions.chat.collection) return 'chat';
  }

  if (embeddingOptions) {
    const fallback =
      embeddingOptions.default_target === 'both'
        ? 'chat'
        : embeddingOptions.default_target;
    if (fallback === 'search' || fallback === 'chat') return fallback;
  }

  return null;
}

/**
 * Map live Chroma coverage to a single ingest radio when all vectors imply one surface.
 * Returns null when empty, ambiguous (both surfaces), or options missing.
 */
export function resolveEditIngestTargetFromCoverage(
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): SingleIngestTarget | null {
  if (!embeddingOptions || !coverageEntry?.embedded_models?.length) return null;

  const surfaces = new Set<SingleIngestTarget>();
  for (const m of coverageEntry.embedded_models) {
    const coll = m.collection;
    if (!coll) continue;
    if (coll === embeddingOptions.chat.collection) surfaces.add('chat');
    if (coll === embeddingOptions.search.collection) surfaces.add('search');
  }

  if (surfaces.size === 1) {
    return surfaces.has('chat') ? 'chat' : 'search';
  }
  return null;
}

/** Edit Indexing-model radio: coverage (actual) → DB → effective → preferred. */
export function resolveEditIngestTargetSelection(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): SingleIngestTarget | null {
  const fromCoverage = resolveEditIngestTargetFromCoverage(coverageEntry, embeddingOptions);
  if (fromCoverage) return fromCoverage;

  const fromDb = source.ingest_embedding_target;
  if (fromDb === 'search' || fromDb === 'chat') return fromDb;

  return resolveEffectiveIngestTarget(source, embeddingOptions);
}

export function formatCrawlEmbeddedModelLabel(model: CrawlEmbeddedModel): string {
  if (model.provider && model.model) {
    return `${model.provider} / ${model.model}`;
  }
  if (model.model) return model.model;
  if (model.provider) return model.provider;
  return model.collection;
}

export function dedupeCrawlEmbeddedModels(models: CrawlEmbeddedModel[]): CrawlEmbeddedModel[] {
  const seen = new Set<string>();
  const out: CrawlEmbeddedModel[] = [];
  for (const model of models) {
    const key = model.collection || `${model.provider ?? ''}:${model.model ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

function toEmbeddedModel(entry: CoverageModel): CrawlEmbeddedModel {
  return {
    provider: entry.provider ?? null,
    model: entry.model ?? null,
    collection: entry.collection,
    source: entry.source === 'search' || entry.source === 'chat' ? entry.source : null,
  };
}

function hasCoverageVectors(coverageEntry?: ItemEmbeddingCoverageEntry | null): boolean {
  return (coverageEntry?.embedded_models?.length ?? 0) > 0;
}

export function configuredModelForTarget(
  source: CrawlSource,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel | null {
  const projectCollection = projectTargetCollection(target, embeddingOptions);

  // Prefer project Search/Chat destination — never remap leftover vectors from
  // another collection onto this surface (Edit mistral→openai false "already indexed").
  if (target === 'search' && embeddingOptions?.search) {
    return {
      provider: embeddingOptions.search.provider,
      model: embeddingOptions.search.model,
      collection: embeddingOptions.search.collection,
      source: 'search',
    };
  }
  if (target === 'chat' && embeddingOptions?.chat) {
    return {
      provider: embeddingOptions.chat.provider,
      model: embeddingOptions.chat.model,
      collection: embeddingOptions.chat.collection,
      source: 'chat',
    };
  }

  const configured = source.indexed_embedding_models ?? [];
  const match = configured.find((m) => {
    if (m.source !== target) return false;
    if (projectCollection && m.collection && m.collection !== projectCollection) return false;
    return true;
  });
  if (match) return match;

  const ingestTarget = source.ingest_embedding_target;
  if (!ingestTarget && configured.length === 1) {
    const only = configured[0];
    if (projectCollection && only.collection && only.collection !== projectCollection) {
      return null;
    }
    const effectiveTarget = resolveEffectiveIngestTarget(source, embeddingOptions);
    if (effectiveTarget === target) {
      return { ...only, source: target };
    }
  }

  return null;
}

export function targetCollectionForSource(
  source: CrawlSource,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): string | null {
  return configuredModelForTarget(source, target, embeddingOptions)?.collection ?? null;
}

export function projectTargetCollection(
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): string | null {
  if (target === 'search') return embeddingOptions?.search.collection ?? null;
  if (target === 'chat') return embeddingOptions?.chat.collection ?? null;
  return null;
}

function coverageModelsForProjectTarget(
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel[] {
  const targetCollection = projectTargetCollection(target, embeddingOptions);
  const all = (coverageEntry?.embedded_models ?? []).map((m) => toEmbeddedModel(m));
  if (!targetCollection) return [];
  return dedupeCrawlEmbeddedModels(all.filter((m) => m.collection === targetCollection));
}

function otherCollectionIndexedModelsForProjectTarget(
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel[] {
  const targetCollection = projectTargetCollection(target, embeddingOptions);
  const all = dedupeCrawlEmbeddedModels(
    (coverageEntry?.embedded_models ?? []).map((m) => toEmbeddedModel(m)),
  );
  if (!targetCollection) return all;
  return all.filter((m) => m.collection !== targetCollection);
}

function actualIndexedModelForProjectTarget(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel | null {
  const inTargetCoverage = coverageModelsForProjectTarget(
    coverageEntry,
    target,
    embeddingOptions,
  );
  if (inTargetCoverage.length > 0) return inTargetCoverage[0];

  const targetCollection = projectTargetCollection(target, embeddingOptions);
  if (!targetCollection || !sourceIsTrained(source)) return null;

  if (
    otherCollectionIndexedModelsForProjectTarget(coverageEntry, target, embeddingOptions).length >
    0
  ) {
    return null;
  }

  const fromList = (source.indexed_embedding_models ?? []).find(
    (m) => m.collection === targetCollection,
  );
  return fromList ?? null;
}

function crawlSourceHasIndexedDataForProjectTarget(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): boolean {
  return (
    actualIndexedModelForProjectTarget(source, coverageEntry, target, embeddingOptions) !== null
  );
}

export function coverageModelsForTarget(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel[] {
  const targetCollection = targetCollectionForSource(source, target, embeddingOptions);
  const all = (coverageEntry?.embedded_models ?? []).map((m) => toEmbeddedModel(m));

  if (!targetCollection) {
    return [];
  }

  return dedupeCrawlEmbeddedModels(all.filter((m) => m.collection === targetCollection));
}

function actualIndexedModelForTarget(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel | null {
  const inTargetCoverage = coverageModelsForTarget(source, coverageEntry, target, embeddingOptions);
  if (inTargetCoverage.length > 0) return inTargetCoverage[0];

  const targetCollection = targetCollectionForSource(source, target, embeddingOptions);
  if (!targetCollection || !sourceIsTrained(source)) return null;

  if (otherCollectionIndexedModels(source, coverageEntry, target, embeddingOptions).length > 0) {
    return null;
  }

  const fromList = (source.indexed_embedding_models ?? []).find(
    (m) => m.collection === targetCollection,
  );
  return fromList ?? null;
}

function otherCollectionIndexedModels(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel[] {
  const targetCollection = targetCollectionForSource(source, target, embeddingOptions);
  const all = dedupeCrawlEmbeddedModels(
    (coverageEntry?.embedded_models ?? []).map((m) => toEmbeddedModel(m)),
  );
  if (!targetCollection) return all;
  return all.filter((m) => m.collection !== targetCollection);
}

export function crawlSourceHasIndexedDataForTarget(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): boolean {
  return actualIndexedModelForTarget(source, coverageEntry, target, embeddingOptions) !== null;
}

/** True when the source's configured ingest collection has no vectors yet (model switch / first index). */
export function isEmbeddingDestinationPending(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): boolean {
  const target = resolvePersistedIngestTarget(source, embeddingOptions);
  if (!target) {
    return !crawlSourceHasIndexedData(source, coverageEntry);
  }
  return !crawlSourceHasIndexedDataForTarget(source, coverageEntry, target, embeddingOptions);
}

function resolveModelsForSource(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  _embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddedModel[] {
  // Prefer live Chroma coverage (actual indexed models) so the table matches
  // Job Embedded models and drops names when vectors are purged.
  const fromCoverage = dedupeCrawlEmbeddedModels(
    (coverageEntry?.embedded_models ?? []).map((m) => toEmbeddedModel(m)),
  );
  if (fromCoverage.length > 0) {
    return fromCoverage;
  }

  return dedupeCrawlEmbeddedModels(source.indexed_embedding_models ?? []);
}

export function resolveCrawlSourceModelLabels(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): string[] {
  return resolveModelsForSource(source, coverageEntry, embeddingOptions).map(
    formatCrawlEmbeddedModelLabel,
  );
}

export function expandCrawlSourceTableRows(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlSourceTableRow[] {
  const models = resolveModelsForSource(source, coverageEntry, embeddingOptions);
  const deduped = dedupeCrawlEmbeddedModels(models);
  const modelLabels = deduped.map(formatCrawlEmbeddedModelLabel).filter(Boolean);

  return [
    {
      rowKey: source.id,
      source,
      modelLabels,
    },
  ];
}

export function expandCrawlSourcesForTable(
  sources: CrawlSource[],
  coverageBySourceId?: Map<string, ItemEmbeddingCoverageEntry>,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): CrawlSourceTableRow[] {
  return sources.flatMap((source) =>
    expandCrawlSourceTableRows(
      source,
      coverageBySourceId?.get(source.id),
      embeddingOptions,
    ),
  );
}

export function isCrawlIngestEmbeddingTarget(value: unknown): value is CrawlIngestEmbeddingTarget {
  return value === 'search' || value === 'chat' || value === 'both';
}

export function crawlSourceHasIndexedData(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
): boolean {
  return Boolean(source.trained_at) || hasCoverageVectors(coverageEntry);
}

export function shouldShowCrawlEmbeddingCoverageWarning(
  source: CrawlSource,
  coverageEntry?: ItemEmbeddingCoverageEntry | null,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): boolean {
  if (!coverageEntry) return false;

  const effectiveTarget = resolveEffectiveIngestTarget(source, embeddingOptions);
  if (effectiveTarget && embeddingOptions) {
    if (
      crawlSourceHasIndexedDataForTarget(
        source,
        coverageEntry,
        effectiveTarget,
        embeddingOptions,
      )
    ) {
      return false;
    }
    if (sourceIsTrained(source) && hasCoverageVectors(coverageEntry)) {
      return true;
    }
  }

  return Boolean(coverageEntry.missing_active);
}

export type EditEmbeddingTargetFeedback = {
  warning: string | null;
  info: string | null;
};

function resolveConfiguredModelLabel(
  target: SingleIngestTarget,
  embeddingOptions?: CrawlEmbeddingTargetOptions | null,
): string | null {
  if (target === 'search' && embeddingOptions?.search) {
    return formatCrawlEmbeddedModelLabel({
      provider: embeddingOptions.search.provider,
      model: embeddingOptions.search.model,
      collection: embeddingOptions.search.collection,
    });
  }
  if (target === 'chat' && embeddingOptions?.chat) {
    return formatCrawlEmbeddedModelLabel({
      provider: embeddingOptions.chat.provider,
      model: embeddingOptions.chat.model,
      collection: embeddingOptions.chat.collection,
    });
  }
  return null;
}

function buildAlreadyIndexedInfo(
  indexed: CrawlEmbeddedModel,
  otherCollections: CrawlEmbeddedModel[],
  t: (key: string, options?: Record<string, string>) => string,
): string {
  const primary = t('crawl.form.embeddingTarget.editInfo.alreadyIndexed', {
    model: formatCrawlEmbeddedModelLabel(indexed),
  });
  if (otherCollections.length === 0) return primary;
  return `${primary} ${t('crawl.form.embeddingTarget.editInfo.alsoIndexedOther', {
    otherModel: formatCrawlEmbeddedModelLabel(otherCollections[0]),
  })}`;
}

export function resolveEditEmbeddingTargetFeedback(params: {
  source: CrawlSource;
  originalTarget: CrawlIngestEmbeddingTarget | null | undefined;
  nextTarget: CrawlIngestEmbeddingTarget | undefined;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  t: (key: string, options?: Record<string, string>) => string;
}): EditEmbeddingTargetFeedback {
  const { source, originalTarget: persistedTarget, nextTarget, coverageEntry, embeddingOptions, t } =
    params;

  if (nextTarget !== 'search' && nextTarget !== 'chat') {
    return { warning: null, info: null };
  }

  const indexedInNext = actualIndexedModelForProjectTarget(
    source,
    coverageEntry,
    nextTarget,
    embeddingOptions,
  );
  const otherForNext = otherCollectionIndexedModelsForProjectTarget(
    coverageEntry,
    nextTarget,
    embeddingOptions,
  );

  if (
    persistedTarget &&
    (persistedTarget === 'search' || persistedTarget === 'chat') &&
    nextTarget !== persistedTarget
  ) {
    const hasPersistedIndexed = crawlSourceHasIndexedDataForProjectTarget(
      source,
      coverageEntry,
      persistedTarget,
      embeddingOptions,
    );

    if (!hasPersistedIndexed) {
      if (indexedInNext) {
        return {
          warning: null,
          info: buildAlreadyIndexedInfo(indexedInNext, otherForNext, t),
        };
      }
      if (sourceIsTrained(source) && otherForNext.length > 0) {
        const targetModel = resolveConfiguredModelLabel(nextTarget, embeddingOptions) ?? nextTarget;
        return {
          warning: t('crawl.form.embeddingTarget.editWarning.indexedOtherCollection', {
            indexedModel: formatCrawlEmbeddedModelLabel(otherForNext[0]),
            targetModel,
          }),
          info: null,
        };
      }
      return { warning: null, info: null };
    }

    const currentIndexed = actualIndexedModelForProjectTarget(
      source,
      coverageEntry,
      persistedTarget,
      embeddingOptions,
    );
    const currentModel =
      (currentIndexed ? formatCrawlEmbeddedModelLabel(currentIndexed) : null) ??
      resolveConfiguredModelLabel(persistedTarget, embeddingOptions) ??
      persistedTarget;
    const nextModel = resolveConfiguredModelLabel(nextTarget, embeddingOptions) ?? nextTarget;

    const persistedCollection = projectTargetCollection(persistedTarget, embeddingOptions);
    const nextCollection = projectTargetCollection(nextTarget, embeddingOptions);
    const sameDestination =
      currentModel === nextModel ||
      (Boolean(persistedCollection) &&
        Boolean(nextCollection) &&
        persistedCollection === nextCollection);

    // Same physical model/collection: keep "already indexed" info (don't blank the line).
    if (sameDestination) {
      const indexed = indexedInNext ?? currentIndexed;
      if (indexed) {
        return {
          warning: null,
          info: buildAlreadyIndexedInfo(indexed, otherForNext, t),
        };
      }
      return { warning: null, info: null };
    }

    return {
      warning: t('crawl.form.embeddingTarget.editWarning.switchModel', {
        currentModel,
        nextModel,
      }),
      info: null,
    };
  }

  if (indexedInNext) {
    return {
      warning: null,
      info: buildAlreadyIndexedInfo(indexedInNext, otherForNext, t),
    };
  }

  if (sourceIsTrained(source) && otherForNext.length > 0) {
    const targetModel = resolveConfiguredModelLabel(nextTarget, embeddingOptions) ?? nextTarget;
    return {
      warning: t('crawl.form.embeddingTarget.editWarning.indexedOtherCollection', {
        indexedModel: formatCrawlEmbeddedModelLabel(otherForNext[0]),
        targetModel,
      }),
      info: null,
    };
  }

  return { warning: null, info: null };
}
