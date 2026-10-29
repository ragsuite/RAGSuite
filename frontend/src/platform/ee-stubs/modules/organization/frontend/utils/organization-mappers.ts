import type {
  CreateOrgProjectInput,
  InviteOrgUserInput,
  OrgGroup,
  OrgGroupMember,
  OrgGroupMemberWire,
  OrgGroupWire,
  OrgProject,
  OrgProjectAssignment,
  OrgProjectCreateWire,
  OrgProjectAssignmentWire,
  OrgProjectWire,
  OrgSsoConfig,
  OrgSsoConfigUpdateWire,
  OrgSsoConfigWire,
  OrgSsoTestRequestWire,
  OrgSsoTestResult,
  OrgSsoTestWire,
  OrgSummary,
  OrgSummaryUpdateWire,
  OrgSummaryWire,
  OrgUser,
  OrgUserCreateWire,
  OrgUserEffectivePermissionsWire,
  OrgUserListWire,
  OrgUserProjectsWire,
  OrgUserUpdateWire,
  OrgUserWire,
  UpdateOrgSsoInput,
  UpdateOrgUserInput,
} from '@/features/organization/types/organization.types';
import type {
  PermissionSource,
  SourcedProject,
} from '@/features/organization/utils/member-permission-sources';
import { sanitizeProjectPermissions } from '@/features/organization/utils/project-permission-modules';

export function mapOrgSummary(wire: OrgSummaryWire): OrgSummary {
  return {
    id: wire.id,
    name: wire.name,
    slug: wire.slug,
    maxUsers: wire.max_users,
    maxProjects: wire.max_projects,
    registrationEnabled: wire.registration_enabled,
    memberCount: wire.member_count,
    projectCount: wire.project_count,
  };
}

export function mapOrgUser(wire: OrgUserWire): OrgUser {
  return {
    id: wire.id,
    username: wire.username,
    email: wire.email,
    firstName: wire.first_name?.trim() || '',
    lastName: wire.last_name?.trim() || '',
    isActive: wire.is_active,
    role: wire.role,
    inviteStatus: wire.invite_status ?? null,
    createdAt: wire.created_at,
    lastLogin: wire.last_login ?? null,
    jobTitle: wire.job_title?.trim() || '',
    phoneNumber: wire.phone_number?.trim() || '',
    phoneCountryCode: (wire.phone_country_code || '').trim().toUpperCase(),
    country: (wire.country || '').trim().toUpperCase(),
    timezone: wire.timezone?.trim() || '',
    bio: wire.bio?.trim() || '',
    avatar: wire.avatar?.trim() || null,
    groups: (wire.groups ?? []).map((group) => ({ id: group.id, name: group.name })),
  };
}

export function orgUserDisplayName(user: Pick<OrgUser, 'firstName' | 'lastName' | 'username'>): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}

export function mapOrgGroup(wire: OrgGroupWire): OrgGroup {
  return {
    id: wire.id,
    name: wire.name,
    description: wire.description ?? null,
    image: wire.image?.trim() || null,
    memberCount: wire.member_count ?? 0,
    projectCount: wire.project_count ?? 0,
  };
}

export function mapOrgGroupMember(wire: OrgGroupMemberWire): OrgGroupMember {
  return {
    id: wire.id,
    username: wire.username,
    email: wire.email,
    avatar: wire.avatar?.trim() || null,
  };
}

export function mapOrgUserList(wire: OrgUserListWire): { users: OrgUser[]; total: number } {
  return {
    users: (wire.users ?? []).map(mapOrgUser),
    total: wire.total ?? 0,
  };
}

export function mapOrgProjectAssignment(wire: OrgProjectAssignmentWire): OrgProjectAssignment {
  return {
    projectId: String(wire.project_id),
    permissions: sanitizeProjectPermissions(wire.permissions ?? []),
    deniedModules: [...(wire.denied_modules ?? [])],
    projectDenied: Boolean(wire.project_denied),
  };
}

export function mapOrgUserEffectivePermissions(wire: OrgUserEffectivePermissionsWire): {
  userId: number;
  projects: SourcedProject[];
} {
  return {
    userId: wire.user_id,
    projects: (wire.projects ?? []).map((project) => ({
      projectId: String(project.project_id),
      deniedModules: [...(project.denied_modules ?? [])],
      projectDenied: Boolean(project.project_denied),
      permissions: (project.permissions ?? []).map((row) => ({
        key: row.key,
        sources: (row.sources ?? []).flatMap((source): PermissionSource[] => {
          if (source.type === 'group' && source.id != null) {
            return [{ type: 'group', id: source.id, name: source.name?.trim() || `#${source.id}` }];
          }
          if (source.type === 'direct') return [{ type: 'direct' }];
          return [];
        }),
      })),
    })),
  };
}

export function mapOrgUserProjects(wire: OrgUserProjectsWire): {
  userId: number;
  assignments: OrgProjectAssignment[];
  canCreateProjects: boolean;
} {
  return {
    userId: wire.user_id,
    assignments: (wire.assignments ?? []).map(mapOrgProjectAssignment),
    canCreateProjects: Boolean(
      wire.can_create_projects ?? (wire.workspace_permissions ?? []).includes('project:create'),
    ),
  };
}

export function mapOrgProject(wire: OrgProjectWire): OrgProject {
  return {
    id: String(wire.id),
    name: wire.name,
    description: wire.description ?? null,
    isActive: Boolean(wire.is_active),
  };
}

export function mapOrgSsoConfig(wire: OrgSsoConfigWire): OrgSsoConfig {
  return {
    enabled: wire.enabled,
    protocol: wire.protocol,
    provider: wire.provider,
    tenantId: wire.tenant_id ?? null,
    clientId: wire.client_id ?? null,
    clientSecretConfigured: wire.client_secret_configured,
    clientSecretMasked: wire.client_secret_masked?.trim() || null,
    emailDomains: wire.email_domains ?? [],
    jitProvisioningEnabled: wire.jit_provisioning_enabled,
    defaultRole: wire.default_role,
    callbackUrl: wire.callback_url ?? null,
  };
}

export function mapOrgSsoConfigs(wire: {
  callback_url?: string | null;
  providers?: OrgSsoConfigWire[];
}): { callbackUrl: string | null; providers: OrgSsoConfig[] } {
  const providers = (wire.providers ?? []).map(mapOrgSsoConfig);
  const callbackUrl = wire.callback_url ?? providers[0]?.callbackUrl ?? null;
  return { callbackUrl, providers };
}

export function mapOrgSsoTest(wire: OrgSsoTestWire): OrgSsoTestResult {
  return {
    ok: wire.ok,
    message: wire.message,
    issuer: wire.issuer ?? null,
    code: wire.code ?? null,
  };
}

export function toOrgSsoTestWire(input: {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}): OrgSsoTestRequestWire {
  const wire: OrgSsoTestRequestWire = {};
  if (input.tenantId !== undefined) wire.tenant_id = input.tenantId || null;
  if (input.clientId !== undefined) wire.client_id = input.clientId || null;
  if (input.clientSecret !== undefined) wire.client_secret = input.clientSecret || null;
  return wire;
}

export function toOrgSummaryUpdateWire(input: {
  name?: string;
  registrationEnabled?: boolean;
}): OrgSummaryUpdateWire {
  const wire: OrgSummaryUpdateWire = {};
  if (input.name !== undefined) wire.name = input.name;
  if (input.registrationEnabled !== undefined) wire.registration_enabled = input.registrationEnabled;
  return wire;
}

export function toOrgUserCreateWire(input: InviteOrgUserInput): OrgUserCreateWire {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const wire: OrgUserCreateWire = {
    email: input.email.trim().toLowerCase(),
    role: input.role,
    send_invite_email: true,
    project_assignments: (input.projectAssignments ?? []).map((a) => ({
      project_id: a.projectId,
      permissions: sanitizeProjectPermissions(a.permissions),
    })),
    group_ids: input.groupIds ?? [],
  };
  if (firstName) wire.first_name = firstName;
  if (lastName) wire.last_name = lastName;
  return wire;
}

export function toOrgUserUpdateWire(input: UpdateOrgUserInput): OrgUserUpdateWire {
  const wire: OrgUserUpdateWire = {};
  if (input.firstName !== undefined) wire.first_name = input.firstName.trim() || null;
  if (input.lastName !== undefined) wire.last_name = input.lastName.trim() || null;
  if (input.role !== undefined) wire.role = input.role;
  if (input.isActive !== undefined) wire.is_active = input.isActive;
  if (input.jobTitle !== undefined) wire.job_title = input.jobTitle.trim() || null;
  if (input.phoneNumber !== undefined) wire.phone_number = input.phoneNumber.trim() || null;
  if (input.phoneCountryCode !== undefined) wire.phone_country_code = input.phoneCountryCode.trim() || null;
  if (input.country !== undefined) wire.country = input.country.trim() || null;
  if (input.timezone !== undefined) wire.timezone = input.timezone.trim() || null;
  if (input.bio !== undefined) wire.bio = input.bio.trim() || null;
  if (input.avatar !== undefined) wire.avatar = input.avatar.trim() || null;
  if (input.groupIds !== undefined) wire.group_ids = input.groupIds;
  return wire;
}

export function toOrgUserProjectsWire(
  userId: number,
  assignments: OrgProjectAssignment[],
  _canCreateProjects = false,
): OrgUserProjectsWire {
  return {
    user_id: userId,
    assignments: assignments.map((a) => ({
      project_id: a.projectId,
      permissions: sanitizeProjectPermissions(a.permissions).filter((p) => p !== 'project:create'),
      denied_modules: [...(a.deniedModules ?? [])],
      project_denied: Boolean(a.projectDenied),
    })),
    // Members are never granted workspace create via Project access.
    can_create_projects: false,
    workspace_permissions: [],
  };
}

export function toOrgSsoUpdateWire(input: UpdateOrgSsoInput): OrgSsoConfigUpdateWire {
  const wire: OrgSsoConfigUpdateWire = {
    enabled: input.enabled,
    email_domains: input.emailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean),
    default_role: input.defaultRole ?? 'member',
  };
  if (input.tenantId !== undefined) wire.tenant_id = input.tenantId || null;
  if (input.clientId !== undefined) wire.client_id = input.clientId;
  if (input.clientSecret) wire.client_secret = input.clientSecret;
  return wire;
}

export function toOrgProjectCreateWire(input: CreateOrgProjectInput): OrgProjectCreateWire {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
  };
}
