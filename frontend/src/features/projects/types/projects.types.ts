export type Project = {
  id: string;
  name: string;
  description: string;
  ownerId: number;
  isActive: boolean;
  chunkProfile: string | null;
  enhanceIndex: boolean | null;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
};

export type ProjectsListResponse = {
  projects: Project[];
  total: number;
  activeProjectId: string | null;
  activePermissions: string[];
  workspacePermissions: string[];
  canCreateProject: boolean;
};

export type ProjectStatusFilter = 'all' | 'active' | 'inactive';

export type ProjectSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

export type ProjectFormPayload = {
  name: string;
  description: string;
  chunkProfile?: string | null;
  enhanceIndex?: boolean | null;
};

export type ProjectSheet =
  | { type: 'create' }
  | { type: 'edit'; projectId: string }
  | { type: 'confirm-delete'; projectId: string }
  | null;
