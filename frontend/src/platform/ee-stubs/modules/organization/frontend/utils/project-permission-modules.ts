import type {
  LegacyOrgProjectPermission,
  OrgProjectPermission,
} from '@/features/organization/types/organization.types';
import { permissionGranted } from './workspace-permissions';

/** Legacy super-permission — org role handles admin; never persist for members. */
export const DEPRECATED_PROJECT_PERMISSIONS: LegacyOrgProjectPermission[] = ['project:admin'];

export const WORKSPACE_BASE_PERMISSION: OrgProjectPermission = 'project:read';

export const WORKSPACE_CREATE_PERMISSION: OrgProjectPermission = 'project:create';

export type AccessLevel = 'none' | 'read' | 'write';

export type PermissionToggleNode = {
  id: string;
  labelKey: string;
  hintKey?: string;
  module?: string;
  levels?: Array<'read' | 'write'>;
  /** On/off switch; ON grants the highest level in `levels`. */
  hideShow?: boolean;
  children?: PermissionToggleNode[];
};

/**
 * Hierarchical module tree aligned to drawer Application + Management (+ Settings).
 * Each leaf is None / Read / Write (Write includes Read). Read-only leaves omit Write.
 */
export const PROJECT_PERMISSION_MODULES: PermissionToggleNode[] = [
  {
    id: 'analytics',
    labelKey: 'nav.dashboard',
    hintKey: 'org.permissions.modules.analyticsHint',
    module: 'analytics',
    levels: ['read'],
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
        module: 'crawl_domain',
        levels: ['read', 'write'],
      },
      {
        id: 'documents',
        labelKey: 'crawl.tabs.document',
        hintKey: 'org.permissions.crawl.documentsHint',
        module: 'documents',
        levels: ['read', 'write'],
      },
      {
        id: 'text',
        labelKey: 'crawl.tabs.text',
        hintKey: 'org.permissions.crawl.textHint',
        module: 'documents_text',
        levels: ['read', 'write'],
      },
      {
        id: 'qa-pairs',
        labelKey: 'crawl.tabs.qaPairs',
        hintKey: 'org.permissions.crawl.qaPairsHint',
        module: 'documents_qa',
        levels: ['read', 'write'],
      },
      {
        id: 'sitemap',
        labelKey: 'crawl.tabs.sitemap',
        hintKey: 'org.permissions.crawl.sitemapHint',
        module: 'crawl_sitemap',
        levels: ['read', 'write'],
      },
    ],
  },
  {
    id: 'ai_assistant',
    labelKey: 'nav.ai-assistant',
    hintKey: 'org.permissions.modules.aiAssistantHint',
    module: 'ai_assistant',
    levels: ['read', 'write'],
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
            module: 'chatbot_chat',
            levels: ['read', 'write'],
          },
          {
            id: 'settings',
            labelKey: 'chatbot.tabs.settings',
            hintKey: 'org.permissions.chatbot.settingsHint',
            module: 'chatbot_settings',
            levels: ['read', 'write'],
          },
          {
            id: 'integrations',
            labelKey: 'chatbot.tabs.integrations',
            hintKey: 'org.permissions.chatbot.integrationsHint',
            module: 'chatbot_integrations',
            levels: ['read', 'write'],
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
            module: 'search_use',
            levels: ['read', 'write'],
          },
          {
            id: 'settings',
            labelKey: 'search.tabs.settings',
            hintKey: 'org.permissions.search.settingsHint',
            module: 'search_settings',
            levels: ['read', 'write'],
          },
          {
            id: 'integrations',
            labelKey: 'search.tabs.integrations',
            hintKey: 'org.permissions.search.integrationsHint',
            module: 'search_integrations',
            levels: ['read', 'write'],
          },
        ],
      },
    ],
  },
  {
    id: 'model_configuration',
    labelKey: 'nav.model-configuration',
    hintKey: 'org.permissions.modules.modelConfigurationHint',
    module: 'model_configuration',
    levels: ['read', 'write'],
  },
  {
    id: 'compare_models',
    labelKey: 'nav.compare-models',
    hintKey: 'org.permissions.modules.compareModelsHint',
    module: 'compare',
    levels: ['read'],
  },
  {
    id: 'history',
    labelKey: 'nav.history',
    hintKey: 'org.permissions.modules.historyHint',
    module: 'history',
    levels: ['read', 'write'],
    hideShow: true,
  },
  {
    id: 'feedback',
    labelKey: 'nav.feedback',
    hintKey: 'org.permissions.modules.feedbackHint',
    module: 'feedback',
    levels: ['read', 'write'],
  },
  {
    id: 'mcp',
    labelKey: 'nav.mcp',
    hintKey: 'org.permissions.modules.managementHint',
    module: 'mcp',
    levels: ['read', 'write'],
  },
  {
    id: 'system_health',
    labelKey: 'settings.system-health',
    hintKey: 'org.permissions.modules.systemHealthHint',
    module: 'system_health',
    levels: ['read', 'write'],
    hideShow: true,
  },
  {
    id: 'audit_logs',
    labelKey: 'settings.audit-logs',
    hintKey: 'org.permissions.modules.auditLogsHint',
    module: 'audit_logs',
    levels: ['read', 'write'],
    hideShow: true,
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    hintKey: 'org.permissions.modules.settingsHint',
    children: [
      {
        id: 'global',
        labelKey: 'org.permissions.settings.global',
        module: 'settings_global',
        levels: ['read', 'write'],
      },
      {
        id: 'retention',
        labelKey: 'org.permissions.settings.dataRetention',
        module: 'settings_data_retention',
        levels: ['read', 'write'],
      },
      {
        id: 'session',
        labelKey: 'org.permissions.settings.sessionTimeout',
        module: 'settings_session_timeout',
        levels: ['read', 'write'],
      },
      {
        id: 'intl',
        labelKey: 'org.permissions.settings.i18n',
        module: 'settings_i18n',
        levels: ['read', 'write'],
      },
    ],
  },
  {
    id: 'profile',
    labelKey: 'org.permissions.modules.profile',
    hintKey: 'org.permissions.modules.profileHint',
    module: 'profile',
    levels: ['read', 'write'],
  },
];

const RETAINED_HIDDEN_PERMISSIONS: OrgProjectPermission[] = [
  'project:write',
  'voice_pilot:read',
  'voice_pilot:write',
  'compliance:view_receipts',
];

const DROPPED_PERMISSIONS = new Set<string>([
  'connectors:manage',
  'connectors:gmail',
  'connectors:drive',
  'connectors:notion',
  'connectors:confluence',
  'connectors:slack',
  'connectors:sharepoint',
  'connectors:teams',
  'project:admin',
]);

const CANONICAL_STORE = new Set<string>([
  WORKSPACE_BASE_PERMISSION,
  WORKSPACE_CREATE_PERMISSION,
  ...PROJECT_PERMISSION_MODULES.flatMap((node) => allStorePermissions(node)),
  ...RETAINED_HIDDEN_PERMISSIONS,
]);

function maxStorePermission(node: PermissionToggleNode): OrgProjectPermission[] {
  if (!node.module) return [];
  const levels = node.levels ?? ['read', 'write'];
  if (levels.includes('write')) return [`${node.module}:write` as OrgProjectPermission];
  return [`${node.module}:read` as OrgProjectPermission];
}

function allStorePermissions(node: PermissionToggleNode): OrgProjectPermission[] {
  if (!node.module) {
    return (node.children ?? []).flatMap((child) => allStorePermissions(child));
  }
  return (node.levels ?? ['read', 'write']).map(
    (level) => `${node.module}:${level}` as OrgProjectPermission,
  );
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

export function leafPermissionRows(): Array<{
  key: string;
  module: string;
  levels: Array<'read' | 'write'>;
  permissions: OrgProjectPermission[];
}> {
  return walkPermissionNodes()
    .filter((row) => Boolean(row.node.module))
    .map((row) => ({
      key: row.key,
      module: row.node.module as string,
      levels: row.node.levels ?? ['read', 'write'],
      permissions: maxStorePermission(row.node),
    }));
}

export function sanitizeProjectPermissions(
  permissions: Iterable<OrgProjectPermission | string>,
): OrgProjectPermission[] {
  const allowed = new Set<OrgProjectPermission>();
  for (const raw of permissions) {
    if (DEPRECATED_PROJECT_PERMISSIONS.includes(raw as OrgProjectPermission)) continue;
    if (DROPPED_PERMISSIONS.has(raw)) continue;
    if (!CANONICAL_STORE.has(raw) && !isRewritable(raw)) continue;
    for (const canonical of rewriteToStore(raw)) {
      allowed.add(canonical);
    }
  }
  const writes = new Set(
    [...allowed].filter((perm) => perm.endsWith(':write')).map((perm) => perm.slice(0, -':write'.length)),
  );
  for (const perm of [...allowed]) {
    if (perm.endsWith(':read') && writes.has(perm.slice(0, -':read'.length))) {
      allowed.delete(perm);
    }
  }
  if (allowed.size > 0) {
    allowed.add(WORKSPACE_BASE_PERMISSION);
  }
  return [...allowed];
}

function isRewritable(raw: string): boolean {
  return Boolean(REWRITE_MAP[raw]);
}

const REWRITE_MAP: Record<string, OrgProjectPermission[]> = {
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

function rewriteToStore(raw: string): OrgProjectPermission[] {
  if (REWRITE_MAP[raw]) return REWRITE_MAP[raw];
  if (CANONICAL_STORE.has(raw)) return [raw as OrgProjectPermission];
  return [];
}

export function enabledKeysFromPermissions(permissions: OrgProjectPermission[]): Set<string> {
  const keys = new Set<string>();
  const granted = new Set(sanitizeProjectPermissions(permissions));
  for (const leaf of leafPermissionRows()) {
    if (permissionGranted(granted, `${leaf.module}:read` as OrgProjectPermission)) {
      keys.add(leaf.key);
    }
  }
  return keys;
}

export function leafLevelFromPermissions(
  permissions: OrgProjectPermission[],
  leafKey: string,
): AccessLevel {
  const leaf = leafPermissionRows().find((row) => row.key === leafKey);
  if (!leaf) return 'none';
  const granted = new Set(sanitizeProjectPermissions(permissions));
  if (leaf.levels.includes('write') && permissionGranted(granted, `${leaf.module}:write` as OrgProjectPermission)) {
    return 'write';
  }
  if (permissionGranted(granted, `${leaf.module}:read` as OrgProjectPermission)) {
    return 'read';
  }
  return 'none';
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

export function permissionsFromLeafLevels(levels: ReadonlyMap<string, AccessLevel>): OrgProjectPermission[] {
  const collected: OrgProjectPermission[] = [];
  for (const leaf of leafPermissionRows()) {
    const level = levels.get(leaf.key) ?? 'none';
    if (level === 'write' && leaf.levels.includes('write')) {
      collected.push(`${leaf.module}:write` as OrgProjectPermission);
    } else if (level === 'read' || (level === 'write' && !leaf.levels.includes('write'))) {
      collected.push(`${leaf.module}:read` as OrgProjectPermission);
    }
  }
  return sanitizeProjectPermissions(collected);
}

export function descendantLeafKeys(nodeKey: string): string[] {
  return leafPermissionRows()
    .map((leaf) => leaf.key)
    .filter((key) => key === nodeKey || key.startsWith(`${nodeKey}.`));
}

export function linkedLeafKeys(leafKey: string): string[] {
  const target = leafPermissionRows().find((leaf) => leaf.key === leafKey);
  if (!target) return [leafKey];
  return leafPermissionRows()
    .filter((leaf) => leaf.module === target.module)
    .map((leaf) => leaf.key);
}

export function overlappingLeafKeys(leafKey: string): string[] {
  return linkedLeafKeys(leafKey);
}

export function toggleNodeLeafKeys(
  enabledKeys: ReadonlySet<string>,
  key: string,
  next: boolean,
): Set<string> {
  const draft = new Set(enabledKeys);
  const leaves = descendantLeafKeys(key);
  const targets = new Set((leaves.length ? leaves : [key]).flatMap((leaf) => linkedLeafKeys(leaf)));
  for (const leaf of targets) {
    if (next) draft.add(leaf);
    else draft.delete(leaf);
  }
  return draft;
}

export function setNodeAccessLevel(
  permissions: OrgProjectPermission[],
  key: string,
  level: AccessLevel,
): OrgProjectPermission[] {
  const current = new Map<string, AccessLevel>();
  for (const leaf of leafPermissionRows()) {
    current.set(leaf.key, leafLevelFromPermissions(permissions, leaf.key));
  }
  const leaves = descendantLeafKeys(key);
  const targets = new Set((leaves.length ? leaves : [key]).flatMap((leaf) => linkedLeafKeys(leaf)));
  for (const leafKey of targets) {
    const leaf = leafPermissionRows().find((row) => row.key === leafKey);
    if (!leaf) continue;
    if (level === 'write' && !leaf.levels.includes('write')) {
      current.set(leafKey, 'read');
    } else {
      current.set(leafKey, level);
    }
  }
  return permissionsFromLeafLevels(current);
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
