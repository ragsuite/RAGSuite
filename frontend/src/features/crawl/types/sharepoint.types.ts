export interface SharePointIntegration {
  id: string;
  account_label: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  is_active: boolean;
  last_sync_at: string | null;
  documents_indexed: number;
  settings: {
    cadence_minutes: number;
    max_files: number;
    max_size_mb: number;
    exclude_images: boolean;
    exclude_videos: boolean;
  };
  sources: {
    sites: Array<{ id: string; name: string }>;
    drives: Array<{ id: string; name: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface SharePointSyncJob {
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

export interface SharePointCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface SharePointCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface SharePointSite {
  id: string;
  name: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
}

export interface SharePointSourcesSelection {
  sites: Array<{ id: string; name: string }>;
  drives: Array<{ id: string; name: string }>;
}

export type SharePointConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
