import type {
  CrawlEmbeddingTargetOptions,
  CrawlIngestEmbeddingTarget,
  CrawlProviderIngestTarget,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import {
  configuredModelForTarget,
  formatCrawlEmbeddedModelLabel,
  projectTargetCollection,
  resolveEditEmbeddingTargetFeedback,
  resolveEditIngestTargetSelection,
  resolvePersistedIngestTarget,
} from '@/features/crawl/utils/crawl-embedding-display';
import {
  isProviderIngestTarget,
  providerDisplayLabel,
  providerOptionFor,
  resolveEditProviderSelection,
  resolveSourceProviderUnavailable,
} from '@/features/crawl/utils/crawl-provider-target';

type TranslateFn = (key: string, options?: Record<string, string>) => string;

export type SourceEmbeddingMessages = {
  info: string | null;
  warning: string | null;
};

const NO_MESSAGES: SourceEmbeddingMessages = { info: null, warning: null };

/** Provider to preselect when editing; null when the current destination is not a configured provider. */
export function resolveEditProviderPreselection(
  source: CrawlSource,
  coverageEntry: ItemEmbeddingCoverageEntry | null | undefined,
  options: CrawlEmbeddingTargetOptions | null | undefined,
): CrawlProviderIngestTarget | null {
  const legacy = resolveEditIngestTargetSelection(source, coverageEntry, options);
  const legacyCollection = legacy ? projectTargetCollection(legacy, options) : null;
  return resolveEditProviderSelection(source, legacyCollection, options);
}

/** i18n key for the "used by" hint under a provider row. */
export function providerUsedByKey(usedBy: readonly ('search' | 'chat')[]): string {
  const chat = usedBy.includes('chat');
  const search = usedBy.includes('search');
  if (chat && search) return 'crawl.form.embeddingTarget.usedBy.both';
  if (chat) return 'crawl.form.embeddingTarget.usedBy.chat';
  if (search) return 'crawl.form.embeddingTarget.usedBy.search';
  return 'crawl.form.embeddingTarget.usedBy.none';
}

function unusedProviderWarning(
  selected: CrawlIngestEmbeddingTarget | undefined,
  options: CrawlEmbeddingTargetOptions,
  t: TranslateFn,
): string | null {
  const option = providerOptionFor(selected, options);
  if (!option || option.used_by.length > 0) return null;
  return t('crawl.form.embeddingTarget.unusedWarning', { provider: option.label });
}

/** Info / warning lines shown under the Indexing model list. */
export function resolveSourceEmbeddingMessages(params: {
  mode: 'add' | 'edit';
  source?: CrawlSource | null;
  selected: CrawlIngestEmbeddingTarget | undefined;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  options: CrawlEmbeddingTargetOptions | null;
  t: TranslateFn;
}): SourceEmbeddingMessages {
  const { mode, source, selected, coverageEntry, options, t } = params;
  if (!options) return NO_MESSAGES;

  if (mode === 'add' || !source) {
    const option = providerOptionFor(selected, options);
    if (!option) return NO_MESSAGES;
    return {
      info: t('crawl.form.embeddingTarget.providerNotice', {
        model: formatCrawlEmbeddedModelLabel(option),
      }),
      warning: unusedProviderWarning(selected, options, t),
    };
  }

  const stored = source.ingest_embedding_target;
  if (!selected) {
    if (resolveSourceProviderUnavailable(source, options) && isProviderIngestTarget(stored)) {
      return {
        info: null,
        warning: t('crawl.form.embeddingTarget.providerUnavailable', {
          provider: providerDisplayLabel(stored, options),
        }),
      };
    }
    const persisted = resolvePersistedIngestTarget(source, options);
    const current = persisted ? configuredModelForTarget(source, persisted, options) : null;
    if (!current) return NO_MESSAGES;
    return {
      info: t('crawl.form.embeddingTarget.legacyUnmatched', {
        model: formatCrawlEmbeddedModelLabel(current),
      }),
      warning: null,
    };
  }

  const feedback = resolveEditEmbeddingTargetFeedback({
    source,
    originalTarget: resolvePersistedIngestTarget(source, options),
    nextTarget: selected,
    coverageEntry,
    embeddingOptions: options,
    t,
  });
  return {
    info: feedback.info,
    warning: feedback.warning ?? unusedProviderWarning(selected, options, t),
  };
}
