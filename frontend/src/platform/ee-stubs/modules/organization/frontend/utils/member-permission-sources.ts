import type { OrgProjectPermission } from '@/features/organization/types/organization.types';
import { sanitizeProjectPermissions } from '@/features/organization/utils/project-permission-modules';

export type PermissionSource =
  | { type: 'direct' }
  | { type: 'group'; id: number; name: string };

export type SourcedPermission = {
  key: string;
  sources: PermissionSource[];
};

export type SourcedProject = {
  projectId: string;
  permissions: SourcedPermission[];
  deniedModules?: string[];
  projectDenied?: boolean;
};

export type SourcedAssignment = {
  projectId: string;
  /** Effective displayed permissions after overlay. */
  permissions: OrgProjectPermission[];
  direct: OrgProjectPermission[];
  group: OrgProjectPermission[];
  deniedModules: string[];
  projectDenied: boolean;
  sourcesByKey: Record<string, PermissionSource[]>;
};

function moduleId(permission: string): string | null {
  const idx = permission.indexOf(':');
  if (idx <= 0) return null;
  return permission.slice(0, idx);
}

function modulesFromPermissions(permissions: OrgProjectPermission[]): Set<string> {
  const out = new Set<string>();
  for (const key of permissions) {
    const module = moduleId(key);
    if (module && module !== 'project') out.add(module);
  }
  return out;
}

/** Effective = Direct overlay on group (Direct None denies that module). */
export function overlayPermissions(
  direct: OrgProjectPermission[],
  group: OrgProjectPermission[],
  deniedModules: string[] = [],
  projectDenied = false,
): OrgProjectPermission[] {
  if (projectDenied) return [];
  const denied = new Set(deniedModules);
  const directClean = sanitizeProjectPermissions(direct);
  const groupClean = sanitizeProjectPermissions(group);
  const directModules = modulesFromPermissions(directClean);
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (key: string) => {
    if (seen.has(key) || key === 'project:create') return;
    const module = moduleId(key);
    if (module && denied.has(module)) return;
    seen.add(key);
    out.push(key);
  };

  for (const key of directClean) add(key);
  for (const key of groupClean) {
    const module = moduleId(key);
    if (module && module !== 'project' && (denied.has(module) || directModules.has(module))) continue;
    if (module === 'project' && (directClean.length > 0 || denied.size > 0)) continue;
    add(key);
  }
  return sanitizeProjectPermissions(out);
}

export function sourcedAssignmentFromProject(project: SourcedProject): SourcedAssignment {
  const split = splitSourcedPermissions(project.permissions);
  const deniedModules = [...(project.deniedModules ?? [])];
  const projectDenied = Boolean(project.projectDenied);
  // When project_denied, API may still send group keys for rehydrate — keep group, clear Direct.
  const direct = projectDenied ? [] : split.direct;
  const permissions = overlayPermissions(direct, split.group, deniedModules, projectDenied);
  return {
    projectId: project.projectId,
    permissions,
    direct,
    group: split.group,
    deniedModules: projectDenied ? [] : deniedModules,
    projectDenied,
    sourcesByKey: split.sourcesByKey,
  };
}

export function assignmentAsSourced(row: {
  projectId: string;
  permissions: OrgProjectPermission[];
  deniedModules?: string[];
  projectDenied?: boolean;
}): SourcedAssignment {
  const permissions = sanitizeProjectPermissions(row.permissions);
  return {
    projectId: row.projectId,
    permissions,
    direct: permissions,
    group: [],
    deniedModules: [...(row.deniedModules ?? [])],
    projectDenied: Boolean(row.projectDenied),
    sourcesByKey: {},
  };
}

export function splitSourcedPermissions(permissions: SourcedPermission[]): {
  direct: OrgProjectPermission[];
  group: OrgProjectPermission[];
  sourcesByKey: Record<string, PermissionSource[]>;
} {
  const direct: string[] = [];
  const group: string[] = [];
  const sourcesByKey: Record<string, PermissionSource[]> = {};
  for (const row of permissions) {
    sourcesByKey[row.key] = row.sources;
    if (row.sources.some((source) => source.type === 'direct')) direct.push(row.key);
    if (row.sources.some((source) => source.type === 'group')) group.push(row.key);
  }
  return {
    direct: sanitizeProjectPermissions(direct),
    group: sanitizeProjectPermissions(group),
    sourcesByKey,
  };
}

export function unionPermissions(
  direct: OrgProjectPermission[],
  group: OrgProjectPermission[],
): OrgProjectPermission[] {
  return overlayPermissions(direct, group, [], false);
}

/**
 * Derive next Direct grants + denials from the effective permission list the UI requested.
 * - Modules set to Read/Write become Direct grants (override group).
 * - Modules turned off while group still grants them become Direct denials.
 * - Modules turned off with no group grant drop Direct for that module.
 */
export function nextDirectOverlay(
  nextEffective: OrgProjectPermission[],
  previousDirect: OrgProjectPermission[],
  groupPermissions: OrgProjectPermission[],
  previousDenied: string[],
): { direct: OrgProjectPermission[]; deniedModules: string[] } {
  const requested = sanitizeProjectPermissions(nextEffective);
  const group = sanitizeProjectPermissions(groupPermissions);
  const groupModules = modulesFromPermissions(group);
  const requestedModules = modulesFromPermissions(requested);
  const prevDirectModules = modulesFromPermissions(previousDirect);
  const prevDenied = new Set(previousDenied);

  const nextDirect: string[] = [];
  const nextDenied = new Set<string>();

  for (const key of requested) {
    const module = moduleId(key);
    if (!module || module === 'project') {
      nextDirect.push(key);
      continue;
    }
    // Keep Direct grant when user asked for this key and either:
    // - group does not grant this exact key / module level needs override, or
    // - it was already Direct, or
    // - group has a different level (e.g. group write, user wants read)
    const groupHasModule = groupModules.has(module);
    const groupKeysForModule = group.filter((g) => moduleId(g) === module);
    const requestedKeysForModule = requested.filter((g) => moduleId(g) === module);
    const levelsMatch =
      groupKeysForModule.length === requestedKeysForModule.length &&
      groupKeysForModule.every((g) => requestedKeysForModule.includes(g));

    if (!groupHasModule || prevDirectModules.has(module) || prevDenied.has(module) || !levelsMatch) {
      nextDirect.push(key);
    }
  }

  // Modules that were on via group/direct but are missing from requested → deny or clear.
  const previouslyVisible = new Set([...groupModules, ...prevDirectModules, ...prevDenied]);
  for (const module of previouslyVisible) {
    if (requestedModules.has(module)) {
      nextDenied.delete(module);
      continue;
    }
    if (groupModules.has(module)) {
      nextDenied.add(module);
    }
  }

  // Strip denied modules from Direct grants.
  const directClean = sanitizeProjectPermissions(
    nextDirect.filter((key) => {
      const module = moduleId(key);
      return !module || module === 'project' || !nextDenied.has(module);
    }),
  );

  return { direct: directClean, deniedModules: [...nextDenied].sort() };
}

/** @deprecated Use nextDirectOverlay — kept name for call-site compatibility during rename. */
export function nextDirectPermissions(
  nextEffective: OrgProjectPermission[],
  previousDirect: OrgProjectPermission[],
  groupPermissions: OrgProjectPermission[],
  previousDenied: string[] = [],
): OrgProjectPermission[] {
  return nextDirectOverlay(nextEffective, previousDirect, groupPermissions, previousDenied).direct;
}

export function rebuildSourcesByKey(
  direct: OrgProjectPermission[],
  previous: Record<string, PermissionSource[]>,
  deniedModules: string[] = [],
): Record<string, PermissionSource[]> {
  const out: Record<string, PermissionSource[]> = {};
  const denied = new Set(deniedModules);
  const keys = new Set([...Object.keys(previous), ...direct]);
  for (const key of keys) {
    const module = moduleId(key);
    if (module && denied.has(module)) continue;
    const groupSources = (previous[key] ?? []).filter((source) => source.type === 'group');
    // Also keep group sources for same module under other keys.
    if (module) {
      for (const [prevKey, sources] of Object.entries(previous)) {
        if (moduleId(prevKey) !== module) continue;
        for (const source of sources) {
          if (source.type !== 'group') continue;
          if (!groupSources.some((s) => s.type === 'group' && s.id === source.id)) {
            groupSources.push(source);
          }
        }
      }
    }
    const sources: PermissionSource[] = [
      ...(direct.includes(key as OrgProjectPermission) ? [{ type: 'direct' as const }] : []),
      ...groupSources,
    ];
    if (sources.length) out[key] = sources;
  }
  return out;
}

export function sourcesForKeys(
  keys: string[],
  sourcesByKey?: Record<string, PermissionSource[]>,
): PermissionSource[] {
  if (!sourcesByKey) return [];
  const seen = new Set<string>();
  const out: PermissionSource[] = [];
  for (const key of keys) {
    for (const source of sourcesByKey[key] ?? []) {
      const id = source.type === 'group' ? `group:${source.id}` : 'direct';
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(source);
    }
  }
  return out;
}
