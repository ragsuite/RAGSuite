import type {
  CrawlEmbeddingProviderOption,
  CrawlEmbeddingTargetOptions,
  CrawlProviderIngestTarget,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';

export const PROVIDER_INGEST_TARGETS: readonly CrawlProviderIngestTarget[] = [
  'openai',
  'azure_openai',
  'mistral',
  'gemini',
  'ollama',
];

export function isProviderIngestTarget(value: unknown): value is CrawlProviderIngestTarget {
  return typeof value === 'string' && (PROVIDER_INGEST_TARGETS as readonly string[]).includes(value);
}

export function providerOptionFor(
  target: unknown,
  options?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddingProviderOption | null {
  if (!isProviderIngestTarget(target) || !options) return null;
  return options.providers.find((p) => p.provider === target) ?? null;
}

export function providerOptionForCollection(
  collection: string | null | undefined,
  options?: CrawlEmbeddingTargetOptions | null,
): CrawlEmbeddingProviderOption | null {
  if (!collection || !options) return null;
  return options.providers.find((p) => p.collection === collection) ?? null;
}

/** Widget surface served by a provider target's collection (preferred surface first). */
export function surfaceForProviderTarget(
  target: unknown,
  options?: CrawlEmbeddingTargetOptions | null,
): 'search' | 'chat' | null {
  const option = providerOptionFor(target, options);
  if (!option || option.used_by.length === 0) return null;
  const preferred = options?.default_target;
  if ((preferred === 'search' || preferred === 'chat') && option.used_by.includes(preferred)) {
    return preferred;
  }
  return option.used_by[0];
}

export function providerDisplayLabel(
  provider: CrawlProviderIngestTarget,
  options?: CrawlEmbeddingTargetOptions | null,
): string {
  return providerOptionFor(provider, options)?.label ?? options?.provider_labels?.[provider] ?? provider;
}

/** Source stores a provider key that is no longer configured (indexing is paused). */
export function resolveSourceProviderUnavailable(
  source: CrawlSource | null | undefined,
  options?: CrawlEmbeddingTargetOptions | null,
): boolean {
  const target = source?.ingest_embedding_target;
  if (!isProviderIngestTarget(target) || !options) return false;
  return providerOptionFor(target, options) === null;
}

/**
 * Edit sheet preselection: the stored provider when still configured, otherwise the
 * configured provider whose collection matches the legacy surface destination.
 */
export function resolveEditProviderSelection(
  source: CrawlSource,
  legacyDestinationCollection: string | null,
  options?: CrawlEmbeddingTargetOptions | null,
): CrawlProviderIngestTarget | null {
  const stored = source.ingest_embedding_target;
  if (isProviderIngestTarget(stored)) {
    return providerOptionFor(stored, options)?.provider ?? null;
  }
  return providerOptionForCollection(legacyDestinationCollection, options)?.provider ?? null;
}
