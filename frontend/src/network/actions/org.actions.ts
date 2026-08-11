import type {
  CreateOrgProjectInput,
  InviteOrgUserInput,
  OrgProject,
  OrgProjectCreateWire,
  OrgProjectAssignment,
  OrgProjectWire,
  OrgSsoConfig,
  OrgSsoConfigWire,
  OrgSsoTestResult,
  OrgSsoTestWire,
  OrgSummary,
  OrgSummaryWire,
  OrgUser,
  OrgUserListWire,
  OrgUserProjectsWire,
  OrgUserWire,
  UpdateOrgSsoInput,
  UpdateOrgUserInput,
} from '@/features/organization/types/organization.types';
import {
  mapOrgProject,
  mapOrgSsoConfig,
  mapOrgSsoTest,
  mapOrgSummary,
  mapOrgUser,
  mapOrgUserList,
  mapOrgUserProjects,
  toOrgSsoUpdateWire,
  toOrgProjectCreateWire,
  toOrgSummaryUpdateWire,
  toOrgUserCreateWire,
  toOrgUserProjectsWire,
  toOrgUserUpdateWire,
} from '@/features/organization/utils/organization-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, patch, post, put } from '@/network/request';

function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetOrgSummary(): Promise<OrgSummary> {
  const body = await get<OrgSummaryWire>(API_CONFIG.ORG);
  return mapOrgSummary(unwrap<OrgSummaryWire>(body));
}

export async function handleUpdateOrgSummary(input: {
  name?: string;
  registrationEnabled?: boolean;
}): Promise<OrgSummary> {
  const body = await put(API_CONFIG.ORG, toOrgSummaryUpdateWire(input));
  return mapOrgSummary(unwrap<OrgSummaryWire>(body));
}

export type ListOrgUsersParams = {
  q?: string;
  role?: string;
  isActive?: boolean;
};

export async function handleListOrgUsers(params: ListOrgUsersParams = {}): Promise<{
  users: OrgUser[];
  total: number;
}> {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.role) search.set('role', params.role);
  if (params.isActive !== undefined) search.set('is_active', String(params.isActive));
  const qs = search.toString();
  const path = qs ? `${API_CONFIG.ORG_USERS}?${qs}` : API_CONFIG.ORG_USERS;
  const body = await get<OrgUserListWire>(path);
  return mapOrgUserList(unwrap<OrgUserListWire>(body));
}

export async function handleInviteOrgUser(input: InviteOrgUserInput): Promise<OrgUser> {
  const body = await post(API_CONFIG.ORG_USERS, toOrgUserCreateWire(input));
  return mapOrgUser(unwrap<OrgUserWire>(body));
}

export async function handleUpdateOrgUser(userId: number, input: UpdateOrgUserInput): Promise<OrgUser> {
  const body = await patch(API_CONFIG.orgUser(userId), toOrgUserUpdateWire(input));
  return mapOrgUser(unwrap<OrgUserWire>(body));
}

export async function handleDeactivateOrgUser(userId: number): Promise<void> {
  await deleteApi(API_CONFIG.orgUser(userId));
}

export async function handleGetOrgUserProjects(userId: number): Promise<{
  userId: number;
  assignments: OrgProjectAssignment[];
}> {
  const body = await get<OrgUserProjectsWire>(API_CONFIG.orgUserProjects(userId));
  return mapOrgUserProjects(unwrap<OrgUserProjectsWire>(body));
}

export async function handleSetOrgUserProjects(
  userId: number,
  assignments: OrgProjectAssignment[],
): Promise<{ userId: number; assignments: OrgProjectAssignment[] }> {
  const body = await put(
    API_CONFIG.orgUserProjects(userId),
    toOrgUserProjectsWire(userId, assignments),
  );
  return mapOrgUserProjects(unwrap<OrgUserProjectsWire>(body));
}

export async function handleListOrgProjects(): Promise<OrgProject[]> {
  const body = await get<OrgProjectWire[] | { projects?: OrgProjectWire[] }>(API_CONFIG.ORG_PROJECTS);
  const raw = unwrap<OrgProjectWire[] | { projects?: OrgProjectWire[] }>(body);
  const list = Array.isArray(raw) ? raw : (raw.projects ?? []);
  return list.map(mapOrgProject);
}

export async function handleCreateOrgProject(input: CreateOrgProjectInput): Promise<OrgProject> {
  const body = await post<OrgProjectCreateWire, OrgProjectWire>(
    API_CONFIG.ORG_PROJECTS,
    toOrgProjectCreateWire(input),
  );
  return mapOrgProject(unwrap<OrgProjectWire>(body));
}

export async function handleGetOrgSso(): Promise<OrgSsoConfig> {
  const body = await get<OrgSsoConfigWire>(API_CONFIG.ORG_SSO);
  return mapOrgSsoConfig(unwrap<OrgSsoConfigWire>(body));
}

export async function handleUpdateOrgSso(input: UpdateOrgSsoInput): Promise<OrgSsoConfig> {
  const body = await put(API_CONFIG.ORG_SSO, toOrgSsoUpdateWire(input));
  return mapOrgSsoConfig(unwrap<OrgSsoConfigWire>(body));
}

export async function handleTestOrgSso(): Promise<OrgSsoTestResult> {
  const body = await post<void, OrgSsoTestWire>(API_CONFIG.ORG_SSO_TEST);
  return mapOrgSsoTest(unwrap<OrgSsoTestWire>(body));
}
