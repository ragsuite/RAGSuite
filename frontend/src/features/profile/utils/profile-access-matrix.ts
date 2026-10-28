import {
  leafLevelFromPermissions,
  walkPermissionNodes,
} from '@/features/organization/utils/project-permission-modules';
import type { OrgProjectPermission } from '@/features/organization/types/organization.types';

export type AccessCellLevel = 'none' | 'read' | 'write' | 'admin';

export type AccessMatrixColumn = {
  key: string;
  labelKey: string;
  groupLabelKey: string;
};

export type AccessMatrixGroup = {
  labelKey: string;
  span: number;
};

export type AccessMatrixProject = {
  id: string;
  name: string;
  permissions: string[];
};

export type AccessGrantedLeaf = {
  key: string;
  labelKey: string;
  level: Exclude<AccessCellLevel, 'none'>;
};

export type AccessGrantedGroup = {
  labelKey: string;
  leaves: AccessGrantedLeaf[];
};

export type AccessMatrixRow = {
  projectId: string;
  projectName: string;
  grantedLeafCount: number;
  isAdmin: boolean;
  cells: AccessCellLevel[];
  groups: AccessGrantedGroup[];
};

export type AccessMatrixModel = {
  columns: AccessMatrixColumn[];
  groups: AccessMatrixGroup[];
  rows: AccessMatrixRow[];
  projectCount: number;
  grantedModuleCount: number;
};

function parentKeyOf(key: string): string | null {
  const index = key.lastIndexOf('.');
  return index === -1 ? null : key.slice(0, index);
}

function isAdminGrant(permissions: string[]): boolean {
  return permissions.includes('project:admin');
}

export function buildAccessMatrixColumns(): AccessMatrixColumn[] {
  const walked = walkPermissionNodes();
  const byKey = new Map(walked.map((row) => [row.key, row]));
  return walked
    .filter((row) => Boolean(row.node.module))
    .map((row) => {
      const parent = parentKeyOf(row.key);
      const parentRow = parent ? byKey.get(parent) : undefined;
      return {
        key: row.key,
        labelKey: row.node.labelKey,
        groupLabelKey: parentRow?.node.labelKey ?? row.node.labelKey,
      };
    });
}

export function buildAccessMatrixGroups(columns: AccessMatrixColumn[]): AccessMatrixGroup[] {
  const groups: AccessMatrixGroup[] = [];
  for (const column of columns) {
    const last = groups[groups.length - 1];
    if (last && last.labelKey === column.groupLabelKey) {
      last.span += 1;
    } else {
      groups.push({ labelKey: column.groupLabelKey, span: 1 });
    }
  }
  return groups;
}

export function grantedGroupsForCells(
  columns: AccessMatrixColumn[],
  groups: AccessMatrixGroup[],
  cells: AccessCellLevel[],
): AccessGrantedGroup[] {
  const granted: AccessGrantedGroup[] = [];
  let offset = 0;
  for (const group of groups) {
    const leaves: AccessGrantedLeaf[] = [];
    for (let index = 0; index < group.span; index += 1) {
      const column = columns[offset + index];
      const level = cells[offset + index];
      if (column && level && level !== 'none') {
        leaves.push({ key: column.key, labelKey: column.labelKey, level });
      }
    }
    offset += group.span;
    if (leaves.length > 0) {
      granted.push({ labelKey: group.labelKey, leaves });
    }
  }
  return granted;
}

export function buildAccessMatrix(projects: AccessMatrixProject[]): AccessMatrixModel {
  const columns = buildAccessMatrixColumns();
  const groups = buildAccessMatrixGroups(columns);
  const rows: AccessMatrixRow[] = projects.map((project) => {
    const admin = isAdminGrant(project.permissions);
    const cells: AccessCellLevel[] = columns.map((column) => {
      if (admin) return 'admin';
      return leafLevelFromPermissions(project.permissions as OrgProjectPermission[], column.key);
    });
    return {
      projectId: project.id,
      projectName: project.name,
      grantedLeafCount: cells.filter((cell) => cell !== 'none').length,
      isAdmin: admin,
      cells,
      groups: grantedGroupsForCells(columns, groups, cells),
    };
  });
  const grantedLeaves = new Set<number>();
  for (const row of rows) {
    row.cells.forEach((cell, index) => {
      if (cell !== 'none') grantedLeaves.add(index);
    });
  }
  return {
    columns,
    groups,
    rows,
    projectCount: rows.length,
    grantedModuleCount: grantedLeaves.size,
  };
}
