export interface ConfluenceIntegration {
  id: string;
  account_label: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  is_active: boolean;
  last_sync_at: string | null;
  documents_indexed: number;
  settings: {
    cadence_minutes: number;
    max_pages: number;
    max_size_mb: number;
  };
  sources: {
    spaces: Array<{ id: string; key?: string | null; name: string }>;
    pages: Array<{ id: string; name: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface ConfluenceSyncJob {
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

export interface ConfluenceCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface ConfluenceCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface ConfluenceSpace {
  id: string;
  key?: string | null;
  name: string;
}

export interface ConfluenceSourcesSelection {
  spaces: Array<{ id: string; key?: string | null; name: string }>;
  pages: Array<{ id: string; name: string }>;
}

export type ConfluenceConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
