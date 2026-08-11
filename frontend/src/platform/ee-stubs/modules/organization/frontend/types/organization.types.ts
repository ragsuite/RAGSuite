export type OrganizationRole = 'org_admin' | 'member';

export type OrgProjectPermission =
  | 'project:read'
  | 'project:write'
  | 'project:create'
  | 'crawl:manage'
  | 'documents:manage'
  | 'connectors:manage'
  | 'connectors:gmail'
  | 'connectors:drive'
  | 'connectors:notion'
  | 'connectors:confluence'
  | 'connectors:slack'
  | 'connectors:sharepoint'
  | 'chat:use'
  | 'chatbot:settings'
  | 'chatbot:integrations'
  | 'search:use'
  | 'search:settings'
  | 'search:integrations'
  | 'compare:use'
  | 'history:read'
  | 'analytics:read'
  | 'api_keys:manage'
  | 'widgets:manage'
  | 'settings:manage'
  | 'feedback:moderate'
  | 'settings:global'
  | 'settings:data_retention'
  | 'settings:i18n'
  | 'profile:general'
  | 'profile:security';

/** @deprecated Use module UI in AssignProjectsSheet — kept for API wire parsing only. */
export type LegacyOrgProjectPermission = OrgProjectPermission | 'project:admin';

export const ORG_PROJECT_PERMISSIONS: OrgProjectPermission[] = [
  'project:read',
  'project:write',
  'crawl:manage',
  'documents:manage',
  'connectors:manage',
  'chat:use',
  'search:use',
  'analytics:read',
  'api_keys:manage',
  'widgets:manage',
  'settings:manage',
];

export type OrgSummaryWire = {
  id: number;
  name: string;
  slug: string;
  max_users: number;
  max_projects: number;
  registration_enabled: boolean;
  member_count: number;
  project_count: number;
};

export type OrgSummaryUpdateWire = {
  name?: string;
  registration_enabled?: boolean;
  default_member_permissions?: OrgProjectPermission[];
};

export type OrgUserWire = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  role: OrganizationRole;
  invite_status?: string | null;
  created_at: string;
  last_login?: string | null;
};

export type OrgUserListWire = {
  users: OrgUserWire[];
  total: number;
};

export type OrgProjectAssignmentWire = {
  project_id: string;
  permissions: OrgProjectPermission[];
};

export type OrgUserCreateWire = {
  username: string;
  email: string;
  role?: OrganizationRole;
  temporary_password?: string | null;
  send_invite_email?: boolean;
  project_assignments?: OrgProjectAssignmentWire[];
};

export type OrgUserUpdateWire = {
  username?: string;
  email?: string;
  role?: OrganizationRole;
  is_active?: boolean;
  department?: string | null;
  job_title?: string | null;
};

export type OrgUserProjectsWire = {
  user_id: number;
  assignments: OrgProjectAssignmentWire[];
};

export type OrgProjectWire = {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type OrgProjectCreateWire = {
  name: string;
  description?: string | null;
};

export type OrgSsoConfigWire = {
  enabled: boolean;
  protocol: string;
  provider: string;
  client_id?: string | null;
  client_secret_configured: boolean;
  authorization_url?: string | null;
  token_url?: string | null;
  jwks_uri?: string | null;
  idp_entity_id?: string | null;
  email_domains: string[];
  jit_provisioning_enabled: boolean;
  default_role: OrganizationRole;
  callback_url?: string | null;
};

export type OrgSsoConfigUpdateWire = {
  enabled: boolean;
  client_id?: string | null;
  client_secret?: string | null;
  email_domains: string[];
  default_role?: OrganizationRole;
};

export type OrgSsoTestWire = {
  ok: boolean;
  message: string;
  issuer?: string | null;
};

export type OrgSummary = {
  id: number;
  name: string;
  slug: string;
  maxUsers: number;
  maxProjects: number;
  registrationEnabled: boolean;
  memberCount: number;
  projectCount: number;
};

export type OrgUser = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
  role: OrganizationRole;
  inviteStatus: string | null;
  createdAt: string;
  lastLogin: string | null;
};

export type OrgProjectAssignment = {
  projectId: string;
  permissions: OrgProjectPermission[];
};

export type OrgProject = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type CreateOrgProjectInput = {
  name: string;
  description?: string;
};

export type OrgSsoConfig = {
  enabled: boolean;
  protocol: string;
  provider: string;
  clientId: string | null;
  clientSecretConfigured: boolean;
  emailDomains: string[];
  jitProvisioningEnabled: boolean;
  defaultRole: OrganizationRole;
  callbackUrl: string | null;
};

export type OrgSsoTestResult = {
  ok: boolean;
  message: string;
  issuer: string | null;
};

export type InviteOrgUserInput = {
  username: string;
  email: string;
  role: OrganizationRole;
  projectAssignments?: OrgProjectAssignment[];
};

export type UpdateOrgUserInput = {
  username?: string;
  email?: string;
  role?: OrganizationRole;
  isActive?: boolean;
};

export type UpdateOrgSsoInput = {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  emailDomains: string[];
  defaultRole?: OrganizationRole;
};
