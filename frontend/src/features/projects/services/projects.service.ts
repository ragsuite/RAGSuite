import type { ProjectFormPayload, Project, ProjectsListResponse } from '@/features/projects/types/projects.types';
import { API_CONFIG } from '@/network/apiUrl';
import {
  handleActivateProject,
  handleCreateProject,
  handleDeleteProject,
  handleGetProject,
  handleGetProjects,
  handleUpdateProject,
} from '@/network/actions/projects.actions';
import { mapProjectListResponse, mapProjectOut } from '@/features/projects/utils/projects-mappers';

export const PROJECTS_API = {
  list: API_CONFIG.PROJECTS,
  item: API_CONFIG.project,
  activate: API_CONFIG.projectActivate,
} as const;

export async function fetchProjects(): Promise<ProjectsListResponse> {
  const response = await handleGetProjects();
  return mapProjectListResponse(response);
}

export async function fetchProjectById(projectId: string): Promise<Project> {
  const response = await handleGetProject(projectId);
  return mapProjectOut(response);
}

export async function createProject(payload: ProjectFormPayload): Promise<Project> {
  const response = await handleCreateProject({
    name: payload.name.trim(),
    description: payload.description.trim(),
    enhance_index: payload.enhanceIndex ?? false,
  });
  return mapProjectOut(response);
}

export async function updateProject(projectId: string, payload: Partial<ProjectFormPayload>): Promise<Project> {
  const body: {
    name?: string;
    description?: string;
    enhance_index?: boolean | null;
  } = {};
  if (payload.name !== undefined) body.name = payload.name.trim();
  if (payload.description !== undefined) body.description = payload.description.trim();
  if (payload.enhanceIndex !== undefined) body.enhance_index = payload.enhanceIndex;
  const response = await handleUpdateProject(projectId, body);
  return mapProjectOut(response);
}

export async function deleteProject(projectId: string): Promise<void> {
  await handleDeleteProject(projectId);
}

export async function activateProject(projectId: string): Promise<ProjectsListResponse> {
  await handleActivateProject(projectId);
  return fetchProjects();
}
