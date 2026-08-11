import type {
  CreateOrgProjectInput,
  InviteOrgUserInput,
  OrgProject,
  OrgProjectAssignment,
  OrgProjectCreateWire,
  OrgProjectAssignmentWire,
  OrgProjectWire,
  OrgSsoConfig,
  OrgSsoConfigUpdateWire,
  OrgSsoConfigWire,
  OrgSsoTestResult,
  OrgSsoTestWire,
  OrgSummary,
  OrgSummaryUpdateWire,
  OrgSummaryWire,
  OrgUser,
  OrgUserCreateWire,
  OrgUserListWire,
  OrgUserProjectsWire,
  OrgUserUpdateWire,
  OrgUserWire,
  UpdateOrgSsoInput,
  UpdateOrgUserInput,
} from '@/features/organization/types/organization.types';
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
    isActive: wire.is_active,
    role: wire.role,
    inviteStatus: wire.invite_status ?? null,
    createdAt: wire.created_at,
    lastLogin: wire.last_login ?? null,
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
  };
}

export function mapOrgUserProjects(wire: OrgUserProjectsWire): {
  userId: number;
  assignments: OrgProjectAssignment[];
} {
  return {
    userId: wire.user_id,
    assignments: (wire.assignments ?? []).map(mapOrgProjectAssignment),
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
    clientId: wire.client_id ?? null,
    clientSecretConfigured: wire.client_secret_configured,
    emailDomains: wire.email_domains ?? [],
    jitProvisioningEnabled: wire.jit_provisioning_enabled,
    defaultRole: wire.default_role,
    callbackUrl: wire.callback_url ?? null,
  };
}

export function mapOrgSsoTest(wire: OrgSsoTestWire): OrgSsoTestResult {
  return {
    ok: wire.ok,
    message: wire.message,
    issuer: wire.issuer ?? null,
  };
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
  return {
    username: input.username.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    send_invite_email: true,
    project_assignments: (input.projectAssignments ?? []).map((a) => ({
      project_id: a.projectId,
      permissions: sanitizeProjectPermissions(a.permissions),
    })),
  };
}

export function toOrgUserUpdateWire(input: UpdateOrgUserInput): OrgUserUpdateWire {
  const wire: OrgUserUpdateWire = {};
  if (input.username !== undefined) wire.username = input.username;
  if (input.email !== undefined) wire.email = input.email;
  if (input.role !== undefined) wire.role = input.role;
  if (input.isActive !== undefined) wire.is_active = input.isActive;
  return wire;
}

export function toOrgUserProjectsWire(
  userId: number,
  assignments: OrgProjectAssignment[],
): OrgUserProjectsWire {
  return {
    user_id: userId,
    assignments: assignments.map((a) => ({
      project_id: a.projectId,
      permissions: sanitizeProjectPermissions(a.permissions),
    })),
  };
}

export function toOrgSsoUpdateWire(input: UpdateOrgSsoInput): OrgSsoConfigUpdateWire {
  const wire: OrgSsoConfigUpdateWire = {
    enabled: input.enabled,
    email_domains: input.emailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean),
    default_role: input.defaultRole ?? 'member',
  };
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
