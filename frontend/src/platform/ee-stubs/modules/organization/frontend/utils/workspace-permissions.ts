import type { AppRouteName } from '@/config/navigation';
import type { OrgProjectPermission } from '@/features/organization/types/organization.types';

export type PermissionToggleNode = {
  id: string;
  labelKey: string;
  hintKey?: string;
  permissions?: OrgProjectPermission[];
  children?: PermissionToggleNode[];
};

/** Routes gated by workspace union (profile/settings) vs active project permissions. */
export const WORKSPACE_SCOPED_ROUTES = new Set<string>(['profile', 'settings']);

/** Nav route → required permission(s); any match grants visibility (org admins bypass). */
export const ROUTE_PERMISSION_REQUIREMENTS: Record<string, OrgProjectPermission[]> = {
  index: ['analytics:read'],
  analytics: ['analytics:read'],
  'crawl-management': [
    'crawl:manage',
    'documents:manage',
    'connectors:manage',
    'connectors:gmail',
    'connectors:drive',
    'connectors:notion',
    'connectors:confluence',
    'connectors:slack',
    'connectors:sharepoint',
  ],
  documents: ['documents:manage'],
  'chatbot-config': ['chat:use', 'chatbot:settings', 'chatbot:integrations'],
  'search-config': ['search:use', 'search:settings', 'search:integrations'],
  'compare-models': ['compare:use'],
  history: ['history:read'],
  configuration: ['api_keys:manage', 'project:write', 'settings:manage'],
  'feedback-moderation': ['feedback:moderate'],
  settings: ['settings:global', 'settings:data_retention', 'settings:i18n'],
  profile: ['profile:general', 'profile:security'],
};

export const CRAWL_SEGMENT_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  domain: ['crawl:manage'],
  document: ['documents:manage'],
  gmail: ['connectors:gmail'],
  'google-drive': ['connectors:drive'],
  notion: ['connectors:notion'],
  confluence: ['connectors:confluence'],
  slack: ['connectors:slack'],
  sharepoint: ['connectors:sharepoint'],
};

export const CHATBOT_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['chat:use'],
  settings: ['chatbot:settings'],
  integrations: ['chatbot:integrations'],
};

export const SEARCH_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  training: ['search:use'],
  settings: ['search:settings'],
  integrations: ['search:integrations'],
  'search-test': ['search:use'],
};

export const SETTINGS_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  global: ['settings:global'],
  retention: ['settings:data_retention'],
  intl: ['settings:i18n'],
};

export const PROFILE_TAB_PERMISSIONS: Record<string, OrgProjectPermission[]> = {
  general: ['profile:general'],
  security: ['profile:security'],
};

export const MOBILE_TAB_ROUTES = ['index', 'crawl-management', 'chatbot-config', 'search-config', 'settings'] as const;

export function permissionGranted(granted: ReadonlySet<string>, required: OrgProjectPermission): boolean {
  if (granted.has('project:admin')) return true;
  if (granted.has(required)) return true;
  if (required.startsWith('connectors:') && granted.has('connectors:manage')) return true;
  return false;
}

export function routeVisible(
  route: string,
  granted: ReadonlySet<string>,
  options?: { isOrgAdmin?: boolean },
): boolean {
  if (options?.isOrgAdmin) return true;
  const required = ROUTE_PERMISSION_REQUIREMENTS[route];
  if (!required?.length) return true;
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

export function firstAccessibleTabRoute(
  canAccessRoute: (route: string) => boolean,
): AppRouteName | null {
  for (const route of MOBILE_TAB_ROUTES) {
    if (canAccessRoute(route)) return route as AppRouteName;
  }
  return null;
}

export function usesWorkspacePermissionScope(routeOrPermission: string): boolean {
  if (WORKSPACE_SCOPED_ROUTES.has(routeOrPermission)) return true;
  return routeOrPermission.startsWith('profile:') || routeOrPermission.startsWith('settings:');
}
