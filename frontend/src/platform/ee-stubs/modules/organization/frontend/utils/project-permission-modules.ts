import type {
  LegacyOrgProjectPermission,
  OrgProjectPermission,
} from '@/features/organization/types/organization.types';

/** Legacy super-permission — org role handles admin; never persist for members. */
export const DEPRECATED_PROJECT_PERMISSIONS: LegacyOrgProjectPermission[] = ['project:admin'];

export const WORKSPACE_BASE_PERMISSION: OrgProjectPermission = 'project:read';

export const WORKSPACE_CREATE_PERMISSION: OrgProjectPermission = 'project:create';

export type PermissionToggleNode = {
  id: string;
  labelKey: string;
  hintKey?: string;
  permissions?: OrgProjectPermission[];
  children?: PermissionToggleNode[];
};

/** Hierarchical module tree — each leaf maps to independent backend permissions. */
export const PROJECT_PERMISSION_MODULES: PermissionToggleNode[] = [
  {
    id: 'analytics',
    labelKey: 'org.permissions.modules.analytics',
    hintKey: 'org.permissions.modules.analyticsHint',
    permissions: ['analytics:read'],
  },
  {
    id: 'crawl',
    labelKey: 'org.permissions.modules.crawl',
    hintKey: 'org.permissions.modules.crawlHint',
    children: [
      {
        id: 'domain',
        labelKey: 'org.permissions.crawl.domain',
        hintKey: 'org.permissions.crawl.domainHint',
        permissions: ['crawl:manage'],
      },
      {
        id: 'documents',
        labelKey: 'org.permissions.crawl.documents',
        hintKey: 'org.permissions.crawl.documentsHint',
        permissions: ['documents:manage'],
      },
      {
        id: 'gmail',
        labelKey: 'org.permissions.crawl.gmail',
        permissions: ['connectors:gmail'],
      },
      {
        id: 'drive',
        labelKey: 'org.permissions.crawl.drive',
        permissions: ['connectors:drive'],
      },
      {
        id: 'notion',
        labelKey: 'org.permissions.crawl.notion',
        permissions: ['connectors:notion'],
      },
      {
        id: 'confluence',
        labelKey: 'org.permissions.crawl.confluence',
        permissions: ['connectors:confluence'],
      },
      {
        id: 'slack',
        labelKey: 'org.permissions.crawl.slack',
        permissions: ['connectors:slack'],
      },
      {
        id: 'sharepoint',
        labelKey: 'org.permissions.crawl.sharepoint',
        permissions: ['connectors:sharepoint'],
      },
    ],
  },
  {
    id: 'chatbot',
    labelKey: 'org.permissions.modules.chatbot',
    hintKey: 'org.permissions.modules.chatbotHint',
    children: [
      {
        id: 'training',
        labelKey: 'org.permissions.chatbot.training',
        hintKey: 'org.permissions.chatbot.trainingHint',
        permissions: ['chat:use'],
      },
      {
        id: 'settings',
        labelKey: 'org.permissions.chatbot.settings',
        hintKey: 'org.permissions.chatbot.settingsHint',
        permissions: ['chatbot:settings'],
      },
      {
        id: 'integrations',
        labelKey: 'org.permissions.chatbot.integrations',
        hintKey: 'org.permissions.chatbot.integrationsHint',
        permissions: ['chatbot:integrations'],
      },
    ],
  },
  {
    id: 'search',
    labelKey: 'org.permissions.modules.search',
    hintKey: 'org.permissions.modules.searchHint',
    children: [
      {
        id: 'training',
        labelKey: 'org.permissions.search.training',
        hintKey: 'org.permissions.search.trainingHint',
        permissions: ['search:use'],
      },
      {
        id: 'settings',
        labelKey: 'org.permissions.search.settings',
        hintKey: 'org.permissions.search.settingsHint',
        permissions: ['search:settings'],
      },
      {
        id: 'integrations',
        labelKey: 'org.permissions.search.integrations',
        hintKey: 'org.permissions.search.integrationsHint',
        permissions: ['search:integrations'],
      },
    ],
  },
  {
    id: 'compare_models',
    labelKey: 'org.permissions.modules.compareModels',
    hintKey: 'org.permissions.modules.compareModelsHint',
    permissions: ['compare:use'],
  },
  {
    id: 'history',
    labelKey: 'org.permissions.modules.history',
    hintKey: 'org.permissions.modules.historyHint',
    permissions: ['history:read'],
  },
  {
    id: 'configuration',
    labelKey: 'org.permissions.modules.configuration',
    hintKey: 'org.permissions.modules.configurationHint',
    children: [
      {
        id: 'api_keys',
        labelKey: 'org.permissions.configuration.apiKeys',
        permissions: ['api_keys:manage'],
      },
      {
        id: 'project_details',
        labelKey: 'org.permissions.configuration.projectDetails',
        hintKey: 'org.permissions.configuration.projectDetailsHint',
        permissions: ['project:write'],
      },
    ],
  },
  {
    id: 'feedback',
    labelKey: 'org.permissions.modules.feedback',
    hintKey: 'org.permissions.modules.feedbackHint',
    permissions: ['feedback:moderate'],
  },
  {
    id: 'settings',
    labelKey: 'org.permissions.modules.settings',
    hintKey: 'org.permissions.modules.settingsHint',
    children: [
      {
        id: 'global',
        labelKey: 'org.permissions.settings.global',
        permissions: ['settings:global'],
      },
      {
        id: 'data_retention',
        labelKey: 'org.permissions.settings.dataRetention',
        permissions: ['settings:data_retention'],
      },
      {
        id: 'i18n',
        labelKey: 'org.permissions.settings.i18n',
        permissions: ['settings:i18n'],
      },
    ],
  },
  {
    id: 'profile',
    labelKey: 'org.permissions.modules.profile',
    hintKey: 'org.permissions.modules.profileHint',
    children: [
      {
        id: 'general',
        labelKey: 'org.permissions.profile.general',
        permissions: ['profile:general'],
      },
      {
        id: 'security',
        labelKey: 'org.permissions.profile.security',
        permissions: ['profile:security'],
      },
    ],
  },
];

const ALL_KNOWN_PERMISSIONS = new Set<string>([
  WORKSPACE_BASE_PERMISSION,
  WORKSPACE_CREATE_PERMISSION,
  ...PROJECT_PERMISSION_MODULES.flatMap((node) => collectNodePermissions(node)),
]);

function collectNodePermissions(node: PermissionToggleNode): OrgProjectPermission[] {
  if (node.permissions?.length) return [...node.permissions];
  return (node.children ?? []).flatMap((child) => collectNodePermissions(child));
}

export function moduleToggleKey(moduleId: string, childId?: string, grandchildId?: string): string {
  if (grandchildId) return `${moduleId}.${childId}.${grandchildId}`;
  if (childId) return `${moduleId}.${childId}`;
  return moduleId;
}

export function walkPermissionNodes(
  nodes: PermissionToggleNode[] = PROJECT_PERMISSION_MODULES,
  parentKey = '',
): Array<{ node: PermissionToggleNode; key: string; depth: number }> {
  const rows: Array<{ node: PermissionToggleNode; key: string; depth: number }> = [];
  for (const node of nodes) {
    const key = parentKey ? `${parentKey}.${node.id}` : node.id;
    rows.push({ node, key, depth: parentKey ? parentKey.split('.').length : 0 });
    if (node.children?.length) {
      rows.push(...walkPermissionNodes(node.children, key));
    }
  }
  return rows;
}

export function leafPermissionRows(): Array<{ key: string; permissions: OrgProjectPermission[] }> {
  return walkPermissionNodes()
    .filter((row) => Boolean(row.node.permissions?.length))
    .map((row) => ({ key: row.key, permissions: row.node.permissions ?? [] }));
}

function permissionMatches(granted: Set<string>, required: OrgProjectPermission): boolean {
  if (granted.has(required)) return true;
  if (required.startsWith('connectors:') && granted.has('connectors:manage')) return true;
  return false;
}

export function sanitizeProjectPermissions(
  permissions: Iterable<OrgProjectPermission | string>,
): OrgProjectPermission[] {
  const allowed = new Set<OrgProjectPermission>();
  for (const raw of permissions) {
    if (DEPRECATED_PROJECT_PERMISSIONS.includes(raw as OrgProjectPermission)) continue;
    if (!ALL_KNOWN_PERMISSIONS.has(raw)) continue;
    allowed.add(raw as OrgProjectPermission);
  }
  if (allowed.size > 0) {
    allowed.add(WORKSPACE_BASE_PERMISSION);
  }
  return [...allowed];
}

export function enabledKeysFromPermissions(permissions: OrgProjectPermission[]): Set<string> {
  const keys = new Set<string>();
  const granted = new Set(sanitizeProjectPermissions(permissions));
  for (const leaf of leafPermissionRows()) {
    if (leaf.permissions.every((perm) => permissionMatches(granted, perm))) {
      keys.add(leaf.key);
    }
  }
  return keys;
}

export function permissionsFromEnabledKeys(enabledKeys: ReadonlySet<string>): OrgProjectPermission[] {
  const collected: OrgProjectPermission[] = [];
  for (const leaf of leafPermissionRows()) {
    if (enabledKeys.has(leaf.key)) {
      collected.push(...leaf.permissions);
    }
  }
  return sanitizeProjectPermissions(collected);
}

export function descendantLeafKeys(nodeKey: string): string[] {
  return leafPermissionRows()
    .map((leaf) => leaf.key)
    .filter((key) => key === nodeKey || key.startsWith(`${nodeKey}.`));
}

export function parentKeyFor(nodeKey: string): string | null {
  const parts = nodeKey.split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
}

export function isParentEnabled(nodeKey: string, enabledKeys: ReadonlySet<string>): boolean {
  const leaves = descendantLeafKeys(nodeKey);
  if (leaves.length === 0) return enabledKeys.has(nodeKey);
  return leaves.some((key) => enabledKeys.has(key));
}

export function defaultAssignmentPermissions(): OrgProjectPermission[] {
  return [WORKSPACE_BASE_PERMISSION];
}

export function workspaceCreateEnabled(permissions: OrgProjectPermission[]): boolean {
  return sanitizeProjectPermissions(permissions).includes(WORKSPACE_CREATE_PERMISSION);
}

export function withWorkspaceCreate<T extends { permissions: OrgProjectPermission[] }>(
  assignments: T[],
  enabled: boolean,
): T[] {
  return assignments.map((row) => {
    const next = new Set(sanitizeProjectPermissions(row.permissions));
    if (enabled) next.add(WORKSPACE_CREATE_PERMISSION);
    else next.delete(WORKSPACE_CREATE_PERMISSION);
    return { ...row, permissions: sanitizeProjectPermissions(next) };
  });
}
