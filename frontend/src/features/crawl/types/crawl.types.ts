export type CrawlPrimaryTab =
  | 'domain'
  | 'document'
  | 'gmail'
  | 'google-drive'
  | 'notion'
  | 'confluence'
  | 'slack'
  | 'sharepoint';
export type CrawlDomainSubTab = 'sources' | 'jobs';

export type CrawlCadence = 'ONCE' | 'DAILY' | 'WEEKLY';
export type HeadlessMode = 'ON' | 'OFF' | 'AUTO';
export type CrawlIngestEmbeddingTarget = 'search' | 'chat' | 'both';
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
export type DocumentStatus = 'queued' | 'extracting' | 'indexing' | 'indexed' | 'failed';
export type DocumentViewMode = 'grid' | 'list';

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

export type CrawlEmbeddingTargetOptions = {
  search: CrawlEmbeddingTargetOption;
  chat: CrawlEmbeddingTargetOption;
  same_collection: boolean;
  default_target: CrawlIngestEmbeddingTarget;
};

export type CrawlSource = {
  id: string;
  name: string;
  base_url: string;
  depth: number;
  cadence: CrawlCadence;
  headless_mode: HeadlessMode;
  allowlist: string[];
  denylist: string[];
  skip_header_footer: boolean;
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
};

export type DocumentFormPayload = {
  fileNames: string[];
  title: string;
  description: string;
  language: string;
  sourceLabel: string;
  uploadAsFolder: boolean;
  files?: Array<{ uri: string; name: string; mimeType?: string } | File>;
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
  base_url: string;
  depth: number;
  cadence: CrawlCadence;
  headless_mode: HeadlessMode;
  description: string;
  skip_header_footer: boolean;
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
  type: 'all' | 'pdf' | 'doc' | 'html' | 'txt';
  status: 'all' | DocumentStatus | 'processing' | 'error';
};

export type CrawlBundle = {
  sources: CrawlSource[];
  jobs: CrawlJob[];
  documents: CrawlDocument[];
};

export type CrawlSheet =
  | { type: 'add-source' }
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
