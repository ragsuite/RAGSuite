export interface TeamsIntegration {
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
  };
  sources: {
    teams: Array<{ id: string; name: string }>;
    channels: Array<{ id: string; name: string; team_id: string }>;
  };
  created_at: string;
  updated_at: string;
}

export interface TeamsSyncJob {
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

export interface TeamsCredentialStatus {
  configured: boolean;
  client_id?: string;
  redirect_uri?: string;
  updated_at?: string;
}

export interface TeamsCredentialInput {
  project_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface TeamsTeam {
  id: string;
  name: string;
}

export interface TeamsChannel {
  id: string;
  name: string;
  team_id: string;
}

export interface TeamsSourcesSelection {
  teams: Array<{ id: string; name: string }>;
  channels: Array<{ id: string; name: string; team_id: string }>;
}

export type TeamsConnectInput = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  save_credentials: boolean;
};
