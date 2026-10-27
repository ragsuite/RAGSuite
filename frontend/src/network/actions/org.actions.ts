import type {
  CreateOrgProjectInput,
  InviteOrgUserInput,
  OrgProject,
  OrgProjectCreateWire,
  OrgProjectAssignment,
  OrgProjectWire,
  OrgSsoConfig,
  OrgSsoConfigs,
  OrgSsoConfigsWire,
  OrgSsoConfigWire,
  OrgSsoProvider,
  OrgSsoTestRequestWire,
  OrgSsoTestResult,
  OrgSsoTestWire,
  OrgSummary,
  OrgSummaryWire,
  OrgGroup,
  OrgGroupListWire,
  OrgGroupMember,
  OrgGroupMembersWire,
  OrgGroupProjectsWire,
  OrgGroupWire,
  OrgUser,
  OrgUserListWire,
  OrgUserProjectsWire,
  OrgUserWire,
  TestOrgSsoInput,
  UpdateOrgSsoInput,
  UpdateOrgUserInput,
} from '@/features/organization/types/organization.types';
import {
  mapOrgGroup,
  mapOrgGroupMember,
  mapOrgProject,
  mapOrgProjectAssignment,
  mapOrgSsoConfig,
  mapOrgSsoConfigs,
  mapOrgSsoTest,
  mapOrgSummary,
  mapOrgUser,
  mapOrgUserList,
  mapOrgUserProjects,
  toOrgSsoTestWire,
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

export type OrgTeamCapabilities = {
  memberRole: boolean;
};

export async function handleGetOrgTeamCapabilities(): Promise<OrgTeamCapabilities> {
  const body = await get<{ member_role?: boolean }>(API_CONFIG.ORG_CAPABILITIES);
  const raw = unwrap<{ member_role?: boolean }>(body);
  return { memberRole: Boolean(raw?.member_role) };
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
  limit?: number;
  offset?: number;
};

export async function handleListOrgUsers(params: ListOrgUsersParams = {}): Promise<{
  users: OrgUser[];
  total: number;
}> {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.role) search.set('role', params.role);
  if (params.isActive !== undefined) search.set('is_active', String(params.isActive));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
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
  canCreateProjects: boolean;
}> {
  const body = await get<OrgUserProjectsWire>(API_CONFIG.orgUserProjects(userId));
  return mapOrgUserProjects(unwrap<OrgUserProjectsWire>(body));
}

export async function handleSetOrgUserProjects(
  userId: number,
  assignments: OrgProjectAssignment[],
  canCreateProjects = false,
): Promise<{ userId: number; assignments: OrgProjectAssignment[]; canCreateProjects: boolean }> {
  const body = await put(
    API_CONFIG.orgUserProjects(userId),
    toOrgUserProjectsWire(userId, assignments, canCreateProjects),
  );
  return mapOrgUserProjects(unwrap<OrgUserProjectsWire>(body));
}

export type ListOrgGroupsParams = {
  q?: string;
  limit?: number;
  offset?: number;
};

export async function handleListOrgGroups(
  params: string | ListOrgGroupsParams = {},
): Promise<{ groups: OrgGroup[]; total: number }> {
  const normalized = typeof params === 'string' ? { q: params } : params;
  const search = new URLSearchParams();
  if (normalized.q?.trim()) search.set('q', normalized.q.trim());
  if (normalized.limit !== undefined) search.set('limit', String(normalized.limit));
  if (normalized.offset !== undefined) search.set('offset', String(normalized.offset));
  const qs = search.toString();
  const path = qs ? `${API_CONFIG.ORG_GROUPS}?${qs}` : API_CONFIG.ORG_GROUPS;
  const body = await get<OrgGroupListWire>(path);
  const raw = unwrap<OrgGroupListWire>(body);
  const groups = (raw.groups ?? []).map(mapOrgGroup);
  return { groups, total: raw.total ?? groups.length };
}

export async function handleReplaceOrgGroupMembers(
  groupId: number,
  userIds: number[],
): Promise<OrgGroupMember[]> {
  const body = await put(API_CONFIG.orgGroupMembers(groupId), { user_ids: userIds });
  return (unwrap<OrgGroupMembersWire>(body).members ?? []).map(mapOrgGroupMember);
}

export async function handleCreateOrgGroup(input: {
  name: string;
  description?: string;
  image?: string | null;
}): Promise<OrgGroup> {
  const body = await post(API_CONFIG.ORG_GROUPS, {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    image: input.image || null,
  });
  return mapOrgGroup(unwrap<OrgGroupWire>(body));
}

export async function handleUpdateOrgGroup(
  groupId: number,
  input: { name?: string; description?: string | null; image?: string | null },
): Promise<OrgGroup> {
  const body = await patch(API_CONFIG.orgGroup(groupId), input);
  return mapOrgGroup(unwrap<OrgGroupWire>(body));
}

export async function handleDeleteOrgGroup(groupId: number): Promise<void> {
  await deleteApi(API_CONFIG.orgGroup(groupId));
}

export async function handleListOrgGroupMembers(groupId: number, query?: string): Promise<OrgGroupMember[]> {
  const search = new URLSearchParams();
  if (query?.trim()) search.set('q', query.trim());
  const qs = search.toString();
  const path = qs ? `${API_CONFIG.orgGroupMembers(groupId)}?${qs}` : API_CONFIG.orgGroupMembers(groupId);
  const body = await get<OrgGroupMembersWire>(path);
  return (unwrap<OrgGroupMembersWire>(body).members ?? []).map(mapOrgGroupMember);
}

export async function handleAddOrgGroupMember(groupId: number, userId: number): Promise<OrgGroupMember[]> {
  const body = await post(API_CONFIG.orgGroupMember(groupId, userId), {});
  return (unwrap<OrgGroupMembersWire>(body).members ?? []).map(mapOrgGroupMember);
}

export async function handleRemoveOrgGroupMember(groupId: number, userId: number): Promise<OrgGroupMember[]> {
  const body = await deleteApi(API_CONFIG.orgGroupMember(groupId, userId));
  return (unwrap<OrgGroupMembersWire>(body).members ?? []).map(mapOrgGroupMember);
}

export async function handleGetOrgGroupProjects(groupId: number): Promise<OrgProjectAssignment[]> {
  const body = await get<OrgGroupProjectsWire>(API_CONFIG.orgGroupProjects(groupId));
  return (unwrap<OrgGroupProjectsWire>(body).assignments ?? []).map(mapOrgProjectAssignment);
}

export async function handleSetOrgGroupProjects(
  groupId: number,
  assignments: OrgProjectAssignment[],
): Promise<OrgProjectAssignment[]> {
  const body = await put(API_CONFIG.orgGroupProjects(groupId), {
    assignments: assignments.map((row) => ({
      project_id: row.projectId,
      permissions: row.permissions,
    })),
  });
  return (unwrap<OrgGroupProjectsWire>(body).assignments ?? []).map(mapOrgProjectAssignment);
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

export async function handleGetOrgSso(): Promise<OrgSsoConfigs> {
  const body = await get<OrgSsoConfigsWire>(API_CONFIG.ORG_SSO);
  return mapOrgSsoConfigs(unwrap<OrgSsoConfigsWire>(body));
}

export async function handleUpdateOrgSso(
  provider: OrgSsoProvider,
  input: UpdateOrgSsoInput,
): Promise<OrgSsoConfig> {
  const body = await put(API_CONFIG.orgSsoProvider(provider), toOrgSsoUpdateWire(input));
  return mapOrgSsoConfig(unwrap<OrgSsoConfigWire>(body));
}

export async function handleTestOrgSso(
  provider: OrgSsoProvider,
  input: TestOrgSsoInput = {},
): Promise<OrgSsoTestResult> {
  const body = await post<OrgSsoTestRequestWire, OrgSsoTestWire>(
    API_CONFIG.orgSsoProviderTest(provider),
    toOrgSsoTestWire(input),
  );
  return mapOrgSsoTest(unwrap<OrgSsoTestWire>(body));
}
