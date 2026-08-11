export interface GoogleDriveIntegration {
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
    exclude_images?: boolean;
    exclude_videos?: boolean;
  };
  sources: {
    folders: Array<{ id: string; name: string }>;
    files?: Array<{ id: string; name: string; mime_type?: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface GoogleDriveSyncJob {
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

export interface GoogleDriveCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface GoogleDriveCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
}

export interface GoogleDriveBrowseItem {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  mime_type?: string | null;
}

export interface GoogleDriveSourcesSelection {
  folders: GoogleDriveFolder[];
  files: Array<{ id: string; name: string; mime_type?: string }>;
}

export type GoogleDriveConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
