export interface NotionIntegration {
  id: string;
  account_label: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  is_active: boolean;
  last_sync_at: string | null;
  documents_indexed: number;
  settings: {
    cadence_minutes: number;
    max_pages: number;
    max_blocks_per_page: number;
    max_db_rows: number;
    max_size_mb: number;
    max_attachments_per_page: number;
    max_comments_per_page: number;
    include_attachments: boolean;
    include_comments: boolean;
  };
  sources: {
    pages: Array<{ id: string; name: string }>;
    databases: Array<{ id: string; name: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface NotionSyncJob {
  id: string;
  integration_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  files_fetched: number;
  files_indexed: number;
  files_skipped: number;
  errors: Array<{ file_id?: string; error: string }>;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface NotionCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface NotionCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface NotionSearchItem {
  id: string;
  name: string;
  kind: 'page' | 'database';
  parent_kind?: 'database' | 'page' | 'workspace' | null;
  parent_name?: string | null;
  last_edited_time?: string | null;
}

export interface NotionSourcesSelection {
  pages: Array<{ id: string; name: string }>;
  databases: Array<{ id: string; name: string }>;
}

export type NotionConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
