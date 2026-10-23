import type { AppRouteName } from '@/config/navigation';
import type { OrgProjectPermission } from '@/features/organization/types/organization.types';

export type PermissionToggleNode = {
  id: string;
  labelKey: string;
  hintKey?: string;
  module?: string;
  levels?: Array<'read' | 'write'>;
  hideShow?: boolean;
  children?: PermissionToggleNode[];
};

/** Routes gated by workspace union (settings) vs active project permissions. */
export const WORKSPACE_SCOPED_ROUTES = new Set<string>(['settings']);

/** Nav route → required permission(s); any match grants visibility (org admins bypass). */
export const ROUTE_PERMISSION_REQUIREMENTS: Record<string, OrgProjectPermission[]> = {
  index: ['analytics:read'],
  analytics: ['analytics:read'],
  'crawl-management': [
    'crawl_domain:read',
    'crawl_sitemap:read',
    'documents:read',
    'documents_text:read',
    'documents_qa:read',
  ],
  documents: ['documents:read', 'documents_text:read', 'documents_qa:read'],
  'ai-assistant': ['ai_assistant:read'],
  'chatbot-config': [
    'chatbot_chat:read',
    'chatbot_settings:read',
    'chatbot_integrations:read',
    'voice_pilot:read',
  ],
  'search-config': ['search_use:read', 'search_settings:read', 'search_integrations:read'],
  'model-configuration': ['model_configuration:read'],
  'compare-models': ['compare:read'],
  'ai-voice-pilot': ['voice_pilot:read'],
  history: ['history:read'],
  configuration: ['mcp:read'],
  'feedback-moderation': ['feedback:read'],
  mcp: ['mcp:read'],
  profile: ['profile:read'],
  'system-health': ['system_health:read'],
  'audit-logs': ['audit_logs:read'],
  compliance: ['audit_logs:read'],
  settings: [
    'settings_global:read',
    'settings_data_retention:read',
    'settings_session_timeout:read',
    'settings_i18n:read',
  ],
};

/** Routes that require every listed permission (not any). */
export const ROUTE_PERMISSION_REQUIRE_ALL = new Set<string>();

export const CRAWL_SEGMENT_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  domain: ['crawl_domain:read'],
  document: ['documents:read'],
  text: ['documents_text:read'],
  'qa-pairs': ['documents_qa:read'],
  sitemap: ['crawl_sitemap:read'],
};

export const CHATBOT_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['chatbot_chat:read'],
  settings: ['chatbot_settings:read'],
  integrations: ['chatbot_integrations:read'],
};

export const CHATBOT_TAB_WRITE_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['chatbot_chat:write'],
  settings: ['chatbot_settings:write'],
  integrations: ['chatbot_integrations:write'],
};

export const SEARCH_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['search_use:read'],
  settings: ['search_settings:read'],
  integrations: ['search_integrations:read'],
  'search-test': ['search_use:read'],
};

export const SEARCH_TAB_WRITE_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['search_use:write'],
  settings: ['search_settings:write'],
  integrations: ['search_integrations:write'],
  'search-test': [],
};

export const SETTINGS_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  global: ['settings_global:read'],
  retention: ['settings_data_retention:read'],
  session: ['settings_session_timeout:read'],
  intl: ['settings_i18n:read'],
};

export const SETTINGS_TAB_WRITE_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  global: ['settings_global:write'],
  retention: ['settings_data_retention:write'],
  session: ['settings_session_timeout:write'],
  intl: ['settings_i18n:write'],
};

export const CRAWL_SEGMENT_WRITE_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  domain: ['crawl_domain:write'],
  document: ['documents:write'],
  text: ['documents_text:write'],
  'qa-pairs': ['documents_qa:write'],
  sitemap: ['crawl_sitemap:write'],
};
export const PROFILE_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  general: ['project:read'],
  security: ['project:read'],
};

export const MOBILE_TAB_ROUTES = ['index', 'crawl-management', 'chatbot-config', 'search-config', 'settings'] as const;

const LEGACY_EXPAND: Record<string, readonly string[]> = {
  'chat:use': ['chatbot_chat:read'],
  'search:use': ['search_use:read'],
  'chatbot:settings': ['chatbot_settings:write'],
  'chatbot:integrations': ['chatbot_integrations:write'],
  'search:settings': ['search_settings:write'],
  'search:integrations': ['search_integrations:write'],
  'model_configuration:manage': ['model_configuration:write'],
  'api_keys:read': ['mcp:read'],
  'api_keys:write': ['mcp:write'],
  'api_keys:manage': ['mcp:write'],
  'ai_assistant:use': ['ai_assistant:read'],
  'ai_assistant:settings': ['ai_assistant:write'],
  'crawl:manage': ['crawl_domain:write', 'crawl_sitemap:write'],
  'crawl:domain': ['crawl_domain:write'],
  'crawl:sitemap': ['crawl_sitemap:write'],
  'documents:manage': ['documents:write', 'documents_text:write', 'documents_qa:write'],
  'documents:document': ['documents:write'],
  'documents:text': ['documents_text:write'],
  'documents:qa_pairs': ['documents_qa:write'],
  'feedback:moderate': ['feedback:write'],
  'settings:manage': ['mcp:write'],
  'settings:global': ['settings_global:write'],
  'settings:data_retention': ['settings_data_retention:write'],
  'settings:session_timeout': ['settings_session_timeout:write'],
  'settings:i18n': ['settings_i18n:write'],
  'compare:use': ['compare:read'],
  'voice_pilot:use': ['voice_pilot:read'],
  'voice_pilot:settings': ['voice_pilot:write'],
  'widgets:manage': [
    'chatbot_settings:write',
    'search_settings:write',
    'chatbot_integrations:write',
    'search_integrations:write',
  ],
  'profile:general': ['profile:write'],
  'profile:security': ['profile:write'],
  'compliance:view_receipts': ['audit_logs:read'],
};

function baseForms(permission: string): readonly string[] {
  if (LEGACY_EXPAND[permission]) return LEGACY_EXPAND[permission];
  return [permission];
}

function grantForms(permission: string): Set<string> {
  const out = new Set<string>();
  for (const base of baseForms(permission)) {
    out.add(base);
    if (base.endsWith(':write')) {
      out.add(`${base.slice(0, -':write'.length)}:read`);
    }
  }
  return out;
}

export function permissionGranted(granted: ReadonlySet<string>, required: OrgProjectPermission | string): boolean {
  if (granted.has('project:admin')) return true;
  if (granted.has(required)) return true;
  const requiredCanon = new Set(baseForms(required));
  const grantedCanon = new Set<string>();
  for (const value of granted) {
    for (const form of grantForms(value)) grantedCanon.add(form);
  }
  for (const item of requiredCanon) {
    if (grantedCanon.has(item)) return true;
  }
  return false;
}

export function moduleAccess(
  granted: ReadonlySet<string>,
  moduleId: string,
): { canRead: boolean; canWrite: boolean } {
  return {
    canRead: permissionGranted(granted, `${moduleId}:read`),
    canWrite: permissionGranted(granted, `${moduleId}:write`),
  };
}

export function routeVisible(
  route: string,
  granted: ReadonlySet<string>,
  options?: { isOrgAdmin?: boolean },
): boolean {
  if (options?.isOrgAdmin) return true;
  const required = ROUTE_PERMISSION_REQUIREMENTS[route];
  if (!required?.length) return true;
  if (ROUTE_PERMISSION_REQUIRE_ALL.has(route)) {
    return required.every((perm) => permissionGranted(granted, perm));
  }
  return required.some((perm) => permissionGranted(granted, perm));
}

export function segmentVisible(
  segment: string,
  map: Record<string, OrgProjectPermission[]>,
  granted: ReadonlySet<string>,
  options?: { isOrgAdmin?: boolean },
): boolean {
  if (options?.isOrgAdmin) return true;
  const required = map[segment];
  if (!required?.length) return true;
  return required.some((perm) => permissionGranted(granted, perm));
}

/** Prefer primary tabs, then other Application routes a member may still open. */
const FALLBACK_ROUTE_ORDER = [
  ...MOBILE_TAB_ROUTES,
  'history',
  'feedback-moderation',
  'ai-assistant',
  'model-configuration',
  'compare-models',
  'mcp',
  'profile',
] as const;

export function firstAccessibleTabRoute(
  canAccessRoute: (route: string) => boolean,
): AppRouteName | null {
  const seen = new Set<string>();
  for (const route of FALLBACK_ROUTE_ORDER) {
    if (seen.has(route)) continue;
    seen.add(route);
    if (canAccessRoute(route)) return route as AppRouteName;
  }
  return null;
}

export function usesWorkspacePermissionScope(routeOrPermission: string): boolean {
  if (WORKSPACE_SCOPED_ROUTES.has(routeOrPermission)) return true;
  return routeOrPermission.startsWith('settings:') || routeOrPermission.startsWith('settings_');
}
