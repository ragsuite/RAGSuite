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

/**
 * Hierarchical module tree aligned to drawer Application + Management (+ Settings/Profile).
 * Label keys prefer `nav.*` / product keys so names match the sidebar and tabs exactly.
 * Each leaf maps to existing backend permissions (no new strings).
 */
export const PROJECT_PERMISSION_MODULES: PermissionToggleNode[] = [
  {
    id: 'analytics',
    labelKey: 'nav.dashboard',
    hintKey: 'org.permissions.modules.analyticsHint',
    permissions: ['analytics:read'],
  },
  {
    id: 'crawl',
    labelKey: 'nav.crawl',
    hintKey: 'org.permissions.modules.crawlHint',
    children: [
      {
        id: 'domain',
        labelKey: 'crawl.tabs.domain',
        hintKey: 'org.permissions.crawl.domainHint',
        permissions: ['crawl:domain'],
      },
      {
        id: 'documents',
        labelKey: 'crawl.tabs.document',
        hintKey: 'org.permissions.crawl.documentsHint',
        permissions: ['documents:document'],
      },
      {
        id: 'text',
        labelKey: 'crawl.tabs.text',
        hintKey: 'org.permissions.crawl.textHint',
        permissions: ['documents:text'],
      },
      {
        id: 'qa-pairs',
        labelKey: 'crawl.tabs.qaPairs',
        hintKey: 'org.permissions.crawl.qaPairsHint',
        permissions: ['documents:qa_pairs'],
      },
      {
        id: 'sitemap',
        labelKey: 'crawl.tabs.sitemap',
        hintKey: 'org.permissions.crawl.sitemapHint',
        permissions: ['crawl:sitemap'],
      },
    ],
  },
  {
    id: 'ai_assistant',
    labelKey: 'nav.ai-assistant',
    hintKey: 'org.permissions.modules.aiAssistantHint',
    // One Project access switch: chat + configure models/providers together.
    permissions: ['ai_assistant:use', 'ai_assistant:settings'],
  },
  {
    id: 'widgets',
    labelKey: 'nav.widgets',
    hintKey: 'org.permissions.modules.widgetsHint',
    children: [
      {
        id: 'chatbot',
        labelKey: 'widgets.tabs.chatbot',
        hintKey: 'widgets.tabs.chatbotDescription',
        children: [
          {
            id: 'training',
            labelKey: 'chatbot.tabs.training',
            hintKey: 'org.permissions.chatbot.trainingHint',
            permissions: ['chat:use'],
          },
          {
            id: 'settings',
            labelKey: 'chatbot.tabs.settings',
            hintKey: 'org.permissions.chatbot.settingsHint',
            permissions: ['chatbot:settings'],
          },
          {
            id: 'integrations',
            labelKey: 'chatbot.tabs.integrations',
            hintKey: 'org.permissions.chatbot.integrationsHint',
            permissions: ['chatbot:integrations'],
          },
        ],
      },
      {
        id: 'search',
        labelKey: 'widgets.tabs.search',
        hintKey: 'widgets.tabs.searchDescription',
        children: [
          {
            id: 'training',
            labelKey: 'search.tabs.training',
            hintKey: 'org.permissions.search.trainingHint',
            permissions: ['search:use'],
          },
          {
            id: 'settings',
            labelKey: 'search.tabs.settings',
            hintKey: 'org.permissions.search.settingsHint',
            permissions: ['search:settings'],
          },
          {
            id: 'integrations',
            labelKey: 'search.tabs.integrations',
            hintKey: 'org.permissions.search.integrationsHint',
            permissions: ['search:integrations'],
          },
          {
            id: 'search_test',
            labelKey: 'search.tabs.searchTest',
            hintKey: 'org.permissions.search.searchTestHint',
            permissions: ['search:use'],
          },
        ],
      },
    ],
  },
  {
    id: 'model_configuration',
    labelKey: 'nav.model-configuration',
    hintKey: 'org.permissions.modules.modelConfigurationHint',
    permissions: ['model_configuration:manage'],
  },
  {
    id: 'compare_models',
    labelKey: 'nav.compare-models',
    hintKey: 'org.permissions.modules.compareModelsHint',
    permissions: ['compare:use'],
  },
  {
    id: 'history',
    labelKey: 'nav.history',
    hintKey: 'org.permissions.modules.historyHint',
    permissions: ['history:read'],
  },
  {
    id: 'feedback',
    labelKey: 'nav.feedback',
    hintKey: 'org.permissions.modules.feedbackHint',
    permissions: ['feedback:moderate'],
  },
  {
    id: 'mcp',
    labelKey: 'nav.mcp',
    hintKey: 'org.permissions.modules.managementHint',
    permissions: ['settings:manage'],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    hintKey: 'org.permissions.modules.settingsHint',
    permissions: [
      'settings:global',
      'settings:data_retention',
      'settings:session_timeout',
      'settings:i18n',
    ],
  },
  {
    id: 'profile',
    labelKey: 'profile.title',
    hintKey: 'org.permissions.modules.profileHint',
    permissions: ['profile:general', 'profile:security'],
  },
];

/** Kept known for sanitize when not shown in the assign UI (no drawer module). */
const RETAINED_HIDDEN_PERMISSIONS: OrgProjectPermission[] = [
  'connectors:manage',
  'connectors:gmail',
  'connectors:drive',
  'connectors:notion',
  'connectors:confluence',
  'connectors:slack',
  'connectors:sharepoint',
  'connectors:teams',
  'widgets:manage',
  'api_keys:manage',
  'project:write',
  'voice_pilot:use',
  'voice_pilot:settings',
  // Legacy umbrellas — kept on load; Sources switches now use granular strings.
  'crawl:manage',
  'documents:manage',
  // System Health / Audit Logs — not assignable in Project access; org admins bypass.
  'compliance:view_receipts',
];

const ALL_KNOWN_PERMISSIONS = new Set<string>([
  WORKSPACE_BASE_PERMISSION,
  WORKSPACE_CREATE_PERMISSION,
  ...PROJECT_PERMISSION_MODULES.flatMap((node) => collectNodePermissions(node)),
  ...RETAINED_HIDDEN_PERMISSIONS,
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
  // Legacy Sources umbrellas still light Domain/Sitemap or Document/Text/Q&A until re-saved.
  if ((required === 'crawl:domain' || required === 'crawl:sitemap') && granted.has('crawl:manage')) {
    return true;
  }
  if (
    (required === 'documents:document' ||
      required === 'documents:text' ||
      required === 'documents:qa_pairs') &&
    granted.has('documents:manage')
  ) {
    return true;
  }
  // Admin Assistant is one switch — either legacy leaf unlocks both required strings.
  if (
    (required === 'ai_assistant:use' || required === 'ai_assistant:settings') &&
    (granted.has('ai_assistant:use') || granted.has('ai_assistant:settings'))
  ) {
    return true;
  }
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

/** Leaves that share the exact same permission set (e.g. Domain / Sitemap → crawl:manage). */
export function linkedLeafKeys(leafKey: string): string[] {
  const target = leafPermissionRows().find((leaf) => leaf.key === leafKey);
  if (!target?.permissions.length) return [leafKey];
  const signature = [...target.permissions].sort().join('\0');
  return leafPermissionRows()
    .filter((leaf) => [...leaf.permissions].sort().join('\0') === signature)
    .map((leaf) => leaf.key);
}

/** Leaves that share at least one permission with the given leaf (including itself). */
export function overlappingLeafKeys(leafKey: string): string[] {
  const target = leafPermissionRows().find((leaf) => leaf.key === leafKey);
  if (!target?.permissions.length) return [leafKey];
  const shared = new Set<string>(target.permissions);
  return leafPermissionRows()
    .filter((leaf) => leaf.permissions.some((perm) => shared.has(perm)))
    .map((leaf) => leaf.key);
}

/**
 * Next enabled-leaf set after toggling a node (leaf or group).
 * Enabling adds the node's leaves and identical-permission twins.
 * Disabling also removes leaves that overlap on any permission
 * (e.g. Domain/Sitemap → crawl:manage), otherwise they would re-grant
 * the permission and the switch could not be turned off.
 */
export function toggleNodeLeafKeys(
  enabledKeys: ReadonlySet<string>,
  key: string,
  next: boolean,
): Set<string> {
  const draft = new Set(enabledKeys);
  const leaves = descendantLeafKeys(key);
  const baseTargets = leaves.length ? leaves : [key];
  const targets = new Set(baseTargets.flatMap((leaf) => linkedLeafKeys(leaf)));
  if (!next) {
    for (const leaf of [...targets]) {
      for (const overlap of overlappingLeafKeys(leaf)) targets.add(overlap);
    }
  }
  for (const leaf of targets) {
    if (next) draft.add(leaf);
    else draft.delete(leaf);
  }
  return draft;
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
