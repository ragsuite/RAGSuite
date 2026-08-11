export type ProjectOut = {
  id: string;
  name: string;
  description: string;
  owner_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions?: string[];
};

export type ProjectListResponse = {
  projects: ProjectOut[];
  total: number;
  active_project_id: string | null;
  active_permissions?: string[];
  workspace_permissions?: string[];
  can_create_project?: boolean;
};

export type ProjectCreateBody = {
  name: string;
  description: string;
};

export type ProjectUpdateBody = {
  name?: string;
  description?: string;
};
