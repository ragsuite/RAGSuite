export type OrganizationRole = 'org_admin' | 'member';

export type OrgProjectPermission =
  | 'project:read'
  | 'project:write'
  | 'project:create'
  | 'analytics:read'
  | 'crawl_domain:read'
  | 'crawl_domain:write'
  | 'crawl_sitemap:read'
  | 'crawl_sitemap:write'
  | 'documents:read'
  | 'documents:write'
  | 'documents_text:read'
  | 'documents_text:write'
  | 'documents_qa:read'
  | 'documents_qa:write'
  | 'ai_assistant:read'
  | 'ai_assistant:write'
  | 'chatbot_chat:read'
  | 'chatbot_chat:write'
  | 'chatbot_settings:read'
  | 'chatbot_settings:write'
  | 'chatbot_integrations:read'
  | 'chatbot_integrations:write'
  | 'search_use:read'
  | 'search_use:write'
  | 'search_settings:read'
  | 'search_settings:write'
  | 'search_integrations:read'
  | 'search_integrations:write'
  | 'model_configuration:read'
  | 'model_configuration:write'
  | 'compare:read'
  | 'history:read'
  | 'history:write'
  | 'feedback:read'
  | 'feedback:write'
  | 'mcp:read'
  | 'mcp:write'
  | 'api_keys:read' // legacy wire; rewritten to mcp:read
  | 'api_keys:write' // legacy wire; rewritten to mcp:write
  | 'settings_global:read'
  | 'settings_global:write'
  | 'settings_data_retention:read'
  | 'settings_data_retention:write'
  | 'settings_session_timeout:read'
  | 'settings_session_timeout:write'
  | 'settings_i18n:read'
  | 'settings_i18n:write'
  | 'system_health:read'
  | 'system_health:write'
  | 'audit_logs:read'
  | 'audit_logs:write'
  | 'profile:read'
  | 'profile:write'
  | 'voice_pilot:read'
  | 'voice_pilot:write'
  | 'compliance:view_receipts'
  // Legacy aliases (accepted on the wire, rewritten by sanitize).
  | 'crawl:manage'
  | 'crawl:domain'
  | 'crawl:sitemap'
  | 'documents:manage'
  | 'documents:document'
  | 'documents:text'
  | 'documents:qa_pairs'
  | 'connectors:manage'
  | 'connectors:gmail'
  | 'connectors:drive'
  | 'connectors:notion'
  | 'connectors:confluence'
  | 'connectors:slack'
  | 'connectors:sharepoint'
  | 'connectors:teams'
  | 'ai_assistant:use'
  | 'ai_assistant:settings'
  | 'chat:use'
  | 'chatbot:settings'
  | 'chatbot:integrations'
  | 'search:use'
  | 'search:settings'
  | 'search:integrations'
  | 'model_configuration:manage'
  | 'compare:use'
  | 'voice_pilot:use'
  | 'voice_pilot:settings'
  | 'api_keys:manage'
  | 'widgets:manage'
  | 'settings:manage'
  | 'feedback:moderate'
  | 'settings:global'
  | 'settings:data_retention'
  | 'settings:session_timeout'
  | 'settings:i18n'
  | 'profile:general'
  | 'profile:security';

/** @deprecated Use module UI in AssignProjectsSheet — kept for API wire parsing only. */
export type LegacyOrgProjectPermission = OrgProjectPermission | 'project:admin';

export const ORG_PROJECT_PERMISSIONS: OrgProjectPermission[] = [
  'project:read',
  'project:write',
  'analytics:read',
  'crawl_domain:write',
  'documents:write',
  'chatbot_chat:write',
  'search_use:read',
  'search_use:write',
  'mcp:write',
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
  avatar?: string | null;
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
  job_title?: string | null;
};

export type OrgUserProjectsWire = {
  user_id: number;
  assignments: OrgProjectAssignmentWire[];
  can_create_projects?: boolean;
  workspace_permissions?: string[];
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

export type OrgSsoProvider = 'google' | 'microsoft';

export type OrgSsoConfigWire = {
  enabled: boolean;
  protocol: string;
  provider: string;
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret_configured: boolean;
  client_secret_masked?: string | null;
  authorization_url?: string | null;
  token_url?: string | null;
  jwks_uri?: string | null;
  idp_entity_id?: string | null;
  email_domains: string[];
  jit_provisioning_enabled: boolean;
  default_role: OrganizationRole;
  callback_url?: string | null;
};

export type OrgSsoConfigsWire = {
  callback_url?: string | null;
  providers: OrgSsoConfigWire[];
};

export type OrgSsoConfigUpdateWire = {
  enabled: boolean;
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  email_domains: string[];
  default_role?: OrganizationRole;
};

export type OrgSsoTestRequestWire = {
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

export type OrgSsoTestWire = {
  ok: boolean;
  message: string;
  issuer?: string | null;
  code?: string | null;
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
  avatar: string | null;
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
  tenantId: string | null;
  clientId: string | null;
  clientSecretConfigured: boolean;
  clientSecretMasked: string | null;
  emailDomains: string[];
  jitProvisioningEnabled: boolean;
  defaultRole: OrganizationRole;
  callbackUrl: string | null;
};

export type OrgSsoConfigs = {
  callbackUrl: string | null;
  providers: OrgSsoConfig[];
};

export type OrgSsoTestResult = {
  ok: boolean;
  message: string;
  issuer: string | null;
  code: string | null;
};

export type TestOrgSsoInput = {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
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
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  emailDomains: string[];
  defaultRole?: OrganizationRole;
};
