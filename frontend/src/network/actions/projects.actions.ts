import type {
  ProjectCreateBody,
  ProjectListResponse,
  ProjectOut,
  ProjectUpdateBody,
} from '@/features/projects/types/projects.api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

export async function handleGetProjects(): Promise<ProjectListResponse> {
  return (await get<ProjectListResponse>(API_CONFIG.PROJECTS)) as ProjectListResponse;
}

export async function handleGetProject(projectId: string): Promise<ProjectOut> {
  return (await get<ProjectOut>(API_CONFIG.project(projectId))) as ProjectOut;
}

export async function handleCreateProject(body: ProjectCreateBody): Promise<ProjectOut> {
  return (await post<ProjectCreateBody, ProjectOut>(API_CONFIG.PROJECTS, body)) as ProjectOut;
}

export async function handleUpdateProject(projectId: string, body: ProjectUpdateBody): Promise<ProjectOut> {
  return (await put<ProjectUpdateBody, ProjectOut>(API_CONFIG.project(projectId), body)) as ProjectOut;
}

export async function handleDeleteProject(projectId: string): Promise<void> {
  await deleteApi(API_CONFIG.project(projectId));
}

export async function handleActivateProject(projectId: string): Promise<ProjectOut> {
  return (await post<void, ProjectOut>(API_CONFIG.projectActivate(projectId))) as ProjectOut;
}
