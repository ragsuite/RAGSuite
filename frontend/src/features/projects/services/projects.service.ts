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
  });
  return mapProjectOut(response);
}

export async function updateProject(projectId: string, payload: ProjectFormPayload): Promise<Project> {
  const response = await handleUpdateProject(projectId, {
    name: payload.name.trim(),
    description: payload.description.trim(),
  });
  return mapProjectOut(response);
}

export async function deleteProject(projectId: string): Promise<void> {
  await handleDeleteProject(projectId);
}

export async function activateProject(projectId: string): Promise<ProjectsListResponse> {
  await handleActivateProject(projectId);
  return fetchProjects();
}
