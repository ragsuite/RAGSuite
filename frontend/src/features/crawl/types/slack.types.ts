export interface SlackIntegration {
  id: string;
  account_label: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  is_active: boolean;
  last_sync_at: string | null;
  documents_indexed: number;
  settings: {
    cadence_minutes: number;
    max_messages: number;
    max_size_mb: number;
    include_threads: boolean;
    include_files: boolean;
  };
  sources: {
    channels: Array<{ id: string; name: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface SlackSyncJob {
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

export interface SlackCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface SlackCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SlackSourcesSelection {
  channels: Array<{ id: string; name: string }>;
}

export type SlackConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
