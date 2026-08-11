export type WorkspaceSettingsResponse = {
  org_name: string;
  logo_data_url: string | null;
  primary_color: string;
};

export type WorkspaceSettingsRequest = {
  org_name: string;
  logo_data_url?: string | null;
  primary_color?: string;
};
