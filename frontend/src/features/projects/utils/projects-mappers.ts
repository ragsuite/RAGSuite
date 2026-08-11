import type { ProjectOut, ProjectListResponse } from '@/features/projects/types/projects.api.types';
import type { Project, ProjectsListResponse } from '@/features/projects/types/projects.types';

export function mapProjectOut(api: ProjectOut): Project {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    ownerId: api.owner_id,
    isActive: api.is_active,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    permissions: api.permissions ?? [],
  };
}

export function mapProjectListResponse(api: ProjectListResponse): ProjectsListResponse {
  return {
    projects: api.projects.map(mapProjectOut),
    total: api.total,
    activeProjectId: api.active_project_id,
    activePermissions: api.active_permissions ?? [],
    workspacePermissions: api.workspace_permissions ?? [],
    canCreateProject: Boolean(api.can_create_project),
  };
}
