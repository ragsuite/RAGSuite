export type EmbeddingSource = 'search' | 'chat';

export type EmbeddingModelMeta = {
  dim: number;
  max_tokens: number;
  batch: number;
  metric: string;
  normalize: boolean;
  needs_api_key: boolean;
  known: boolean;
};

export type OtherCollectionEntry = {
  collection: string;
  provider: string | null;
  model: string | null;
  count: number;
};

export type EmbeddingStatus = {
  project_id: string;
  source: EmbeddingSource;
  active_provider: string;
  active_model: string;
  active_collection: string;
  active_vectors: number;
  total_documents: number;
  needs_reindex: boolean;
  coverage_items_total: number;
  coverage_items_embedded: number;
  coverage_items_missing: number;
  missing_uploaded_count: number;
  missing_crawl_sources_count: number;
  crawl_sources_total?: number;
  crawl_sources_expected?: number;
  crawl_sources_other_surface?: number;
  other_collections: OtherCollectionEntry[];
  model_meta: EmbeddingModelMeta;
  fallback_used: boolean;
  /** Saved settings (dropdown); may differ from active_* when runtime falls back. */
  saved_provider?: string;
  saved_model?: string;
  /** True when a usable API key exists for a hosted saved provider (or local needs none). */
  api_key_configured?: boolean;
};

export type ReindexProgress = {
  project_id: string;
  source: EmbeddingSource;
  status: 'idle' | 'started' | 'running' | 'done' | 'completed_with_errors' | 'error';
  total: number;
  embedded: number;
  skipped: number;
  failed: number;
  error: string | null;
  collection: string;
};

export type ReindexOptions = {
  includeCrawled?: boolean;
  documentIds?: string[];
};

export type ItemEmbeddedModel = {
  provider: string | null;
  model: string | null;
  collection: string;
  is_active: boolean;
};

export type ItemEmbeddingCoverageEntry = {
  id: string;
  embedded_models: ItemEmbeddedModel[];
  missing_active: boolean;
};

export type EmbeddingItemCoverage = {
  project_id: string;
  source: EmbeddingSource;
  active_provider: string;
  active_model: string;
  active_collection: string;
  documents: ItemEmbeddingCoverageEntry[];
  crawl_sources: ItemEmbeddingCoverageEntry[];
};
