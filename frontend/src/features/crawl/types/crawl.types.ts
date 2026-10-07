export type CrawlPrimaryTab =
  | 'domain'
  | 'document'
  | 'text'
  | 'qa-pairs'
  | 'sitemap'
  | 'gmail'
  | 'google-drive'
  | 'notion'
  | 'confluence'
  | 'slack'
  | 'sharepoint'
  | 'teams';
export type CrawlDomainSubTab = 'sources' | 'jobs';
/** `domain` follows links from base_url; `sitemap` crawls only pages listed in the sitemap at base_url. */
export type CrawlSourceType = 'domain' | 'sitemap';

export type CrawlCadence = 'ONCE' | 'DAILY' | 'WEEKLY';
export type HeadlessMode = 'ON' | 'OFF' | 'AUTO';
/** Model Configuration provider a crawl source embeds with (current embedding model at crawl time). */
export type CrawlProviderIngestTarget = 'openai' | 'azure_openai' | 'mistral' | 'gemini' | 'ollama';
/** `search` / `chat` / `both` are legacy widget-surface targets kept for existing sources. */
export type CrawlIngestEmbeddingTarget = 'search' | 'chat' | 'both' | CrawlProviderIngestTarget;
export type CrawlSourceApiStatus = 'READY' | 'IDLE' | 'RUNNING' | 'FAILED' | 'PAUSED';
export type PipelineStatus = 'idle' | 'waiting' | 'queued' | 'crawling' | 'indexing' | 'ready' | 'failed';
export type CrawlSourceDisplayStatus =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'error'
  | 'waiting'
  | 'queued'
  | 'crawling'
  | 'indexing'
  | 'unknown';
export type CrawlSourceFilterStatus = 'all' | CrawlSourceDisplayStatus;
export type CrawlJobStatus = 'IDLE' | 'RUNNING' | 'FINISHED' | 'FAILED';
/** `not_trained`: saved Text / Q&A source waiting for an explicit Train action. */
export type DocumentStatus = 'not_trained' | 'queued' | 'extracting' | 'indexing' | 'indexed' | 'failed';
export type DocumentViewMode = 'grid' | 'list';

export type DocumentTrainingMode = 'train' | 'retrain';
export type DocumentTrainingStage = 'queued' | 'reading' | 'training' | 'saving';

/** Live worker progress for a document that is being trained or retrained. */
export type DocumentTrainingProgress = {
  mode: DocumentTrainingMode;
  stage: DocumentTrainingStage;
  /** 0–99 while running; the document leaves this state when training finishes. */
  percent: number;
  done: number;
  total: number;
  etaSeconds: number | null;
};

export type CrawlEmbeddedModel = {
  provider: string | null;
  model: string | null;
  collection: string;
  source?: 'search' | 'chat' | null;
};

export type CrawlEmbeddingTargetOption = {
  source: 'search' | 'chat';
  provider: string;
  model: string;
  collection: string;
};

export type CrawlEmbeddingProviderOption = {
  provider: CrawlProviderIngestTarget;
  label: string;
  model: string;
  collection: string;
  /** Widget surfaces currently retrieving from this provider's collection. */
  used_by: ('search' | 'chat')[];
};

export type CrawlEmbeddingTargetOptions = {
  search: CrawlEmbeddingTargetOption;
  chat: CrawlEmbeddingTargetOption;
  same_collection: boolean;
  default_target: CrawlIngestEmbeddingTarget;
  /** Providers configured in Model Configuration with a working key and an embedding model. */
  providers: CrawlEmbeddingProviderOption[];
  default_provider: CrawlProviderIngestTarget | null;
  /** Display names for every provider key, including ones no longer configured. */
  provider_labels?: Partial<Record<CrawlProviderIngestTarget, string>>;
};

export type CrawlSource = {
  id: string;
  name: string;
  source_type: CrawlSourceType;
  base_url: string;
  depth: number;
  cadence: CrawlCadence;
  headless_mode: HeadlessMode;
  allowlist: string[];
  denylist: string[];
  skip_header_footer: boolean;
  index_site_header: boolean;
  index_site_footer: boolean;
  description: string;
  status: CrawlSourceApiStatus;
  is_active: boolean;
  rescope_root_links: boolean;
  created_at: string;
  updated_at: string;
  last_crawl_at: string | null;
  documents_count: number;
  trained_at: string | null;
  pipeline_status: PipelineStatus;
  is_search_ready: boolean;
  created_by: string;
  latest_job_id: string | null;
  active_job_id: string | null;
  progress_percentage: number | null;
  status_message: string;
  ingest_embedding_target?: CrawlIngestEmbeddingTarget | null;
  indexed_embedding_models?: CrawlEmbeddedModel[];
};

export type CrawlJobUrlEntry = {
  url: string;
  reason?: string;
  status_code?: number;
  referrers?: string[];
  referrers_truncated?: boolean;
};

export type CrawlJobUrlKind = 'crawled' | 'skipped' | 'failed';
export type CrawlJobUrlSort = 'url' | 'referrer';

export type CrawlJobUrlsQuery = {
  kind: CrawlJobUrlKind;
  offset: number;
  limit: number;
  sort: CrawlJobUrlSort;
  q?: string;
};

export type CrawlJobUrlsPage = {
  items: CrawlJobUrlEntry[];
  total: number;
};

export type CrawlJob = {
  id: string;
  source_id: string;
  name: string;
  base_url: string;
  status: CrawlJobStatus;
  documents_count: number;
  finished_at: string | null;
  is_ready: boolean;
  progress_percentage: number | null;
  pipeline_status?: PipelineStatus;
  embeddedModels: string[];
  crawledCount: number;
  skippedCount: number;
  failedCount: number;
  crawledUrls: string[];
  skippedUrls: CrawlJobUrlEntry[];
  failedUrls: CrawlJobUrlEntry[];
  /** Entries available per list on the server; the URL arrays may hold only the first page. */
  urlListTotals?: Record<CrawlJobUrlKind, number>;
};

export type CrawlDocument = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  mimeType: string;
  sizeKb: number;
  sourceLabel: string;
  language: string;
  indexedAt: string | null;
  status: DocumentStatus;
  checksum: string;
  chunksCount: number;
  embeddedModels: string[];
  fileUrl: string | null;
  trainingProgress: DocumentTrainingProgress | null;
  /** Provider this document trains with; null trains into every Search/Chat model. */
  ingestEmbeddingTarget: CrawlProviderIngestTarget | null;
};

export type DocumentFormPayload = {
  fileNames: string[];
  title: string;
  description: string;
  language: string;
  sourceLabel: string;
  uploadAsFolder: boolean;
  files?: Array<{ uri: string; name: string; mimeType?: string } | File>;
  ingestEmbeddingTarget?: CrawlProviderIngestTarget;
};

export type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GmailIntegration = {
  id: string;
  email_address: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  is_active: boolean;
  cadence_minutes: number;
  max_emails_per_sync: number;
  last_sync_at: string | null;
  emails_indexed: number;
  created_at: string;
  updated_at: string;
};

export type GmailSyncJob = {
  id: string;
  integration_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  emails_fetched: number;
  emails_indexed: number;
  errors: Array<{ message_id?: string; error: string }>;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type GmailCredentialStatus = {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
};

export type GmailCredentialInput = {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
};

export type GmailStagedMessage = {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  subject: string;
  sender: string;
  date_raw: string;
  preview: string;
  staged_at: string;
};

export type GmailInboxPage = {
  total: number;
  items: GmailStagedMessage[];
};

export type GmailInboxIndexResult = {
  indexed: number;
  errors: Array<{ staged_id?: string; message_id?: string; error: string }>;
};

export type CrawlGmailState = {
  credentials: GmailCredentialStatus;
  integration: GmailIntegration | null;
  jobs: GmailSyncJob[];
  inbox: GmailInboxPage;
};

export type AddSourcePayload = {
  name: string;
  /** Create-only; the backend keeps a source's type immutable. */
  source_type?: CrawlSourceType;
  base_url: string;
  depth: number;
  cadence: CrawlCadence;
  headless_mode: HeadlessMode;
  description: string;
  skip_header_footer: boolean;
  /** Index each unique site header once, as its own document in this source. */
  index_site_header: boolean;
  /** Index each unique site footer once, as its own document in this source. */
  index_site_footer: boolean;
  rescope_root_links: boolean;
  allowlist: string[];
  denylist: string[];
  ingest_embedding_target?: CrawlIngestEmbeddingTarget;
};

export type CrawlFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;

export type CrawlSourceFilters = {
  query: string;
  status: CrawlSourceFilterStatus;
  cadence: 'all' | CrawlCadence;
};

export type CrawlJobFilterStatus = 'all' | 'running' | 'completed' | 'failed' | 'pending';

export type CrawlJobFilters = {
  query: string;
  status: CrawlJobFilterStatus;
};

export type DocumentFilters = {
  query: string;
  type: 'all' | 'pdf' | 'doc' | 'slides' | 'sheet' | 'html' | 'txt';
  status: 'all' | DocumentStatus | 'processing' | 'error';
};

export type CrawlBundle = {
  sources: CrawlSource[];
  jobs: CrawlJob[];
  documents: CrawlDocument[];
};

export type CrawlSheet =
  | { type: 'add-source'; sourceType?: CrawlSourceType }
  | { type: 'edit-source'; sourceId: string }
  | { type: 'job-detail'; sourceId: string }
  | { type: 'upload-document' }
  | { type: 'edit-document'; documentId: string }
  | { type: 'document-detail'; documentId: string }
  | { type: 'document-inspector'; documentId: string }
  | { type: 'confirm-delete-source'; sourceId: string }
  | { type: 'confirm-delete-document'; documentId: string }
  | { type: 'confirm-bulk-delete-documents' }
  | null;

export type CrawlMenuAnchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type CrawlActionMenuTarget =
  | { kind: 'source'; sourceId: string; anchor?: CrawlMenuAnchor }
  | { kind: 'document'; documentId: string; anchor?: CrawlMenuAnchor }
  | null;
