import type {
  AuditCategoryFilter,
  AuditProjectFilter,
  AuditSeverityFilter,
  AuditStatusFilter,
} from '@/features/audit-logs/types/audit-log.types';

export const AUDIT_LOG_PAGE_SIZE = 30;

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function getAuditProjectFilterOptions(
  t: TranslateFn,
  projects: { id: string; name: string }[],
): { key: AuditProjectFilter; label: string }[] {
  const base: { key: AuditProjectFilter; label: string }[] = [
    { key: 'active', label: t('audit.filter.activeProject') },
    { key: 'all', label: t('audit.filter.allProjects') },
    { key: 'account', label: t('audit.filter.account') },
  ];

  const projectOptions = projects.map((project) => ({
    key: project.id as AuditProjectFilter,
    label: project.name,
  }));

  return [...base, ...projectOptions];
}

export function getAuditCategoryFilterOptions(
  t: TranslateFn,
): { key: AuditCategoryFilter; label: string }[] {
  return [
    { key: 'all', label: t('audit.filter.all') },
    { key: 'identity', label: 'Identity' },
    { key: 'integration', label: 'Integration' },
    { key: 'data', label: 'Data' },
    { key: 'config', label: 'Config' },
  ];
}

export function getAuditSeverityFilterOptions(
  t: TranslateFn,
): { key: AuditSeverityFilter; label: string }[] {
  return [
    { key: 'all', label: t('audit.filter.all') },
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
    { key: 'critical', label: 'Critical' },
  ];
}

export function getAuditStatusFilterOptions(
  t: TranslateFn,
): { key: AuditStatusFilter; label: string }[] {
  return [
    { key: 'all', label: t('audit.filter.all') },
    { key: 'success', label: 'Success' },
    { key: 'failure', label: 'Failure' },
    { key: 'warning', label: 'Warning' },
  ];
}

export function countActiveAuditFilters(filters: {
  project: AuditProjectFilter;
  category: AuditCategoryFilter;
  severity: AuditSeverityFilter;
  status: AuditStatusFilter;
}): number {
  let count = 0;
  if (filters.project !== 'all') count += 1;
  if (filters.category !== 'all') count += 1;
  if (filters.severity !== 'all') count += 1;
  if (filters.status !== 'all') count += 1;
  return count;
}

export function getAuditTableColumns(t: TranslateFn) {
  return AUDIT_TABLE_COLUMN_LAYOUT.map((col) => ({
    ...col,
    label: t(AUDIT_TABLE_COLUMN_LABEL_KEYS[col.key]),
  }));
}

const AUDIT_TABLE_COLUMN_LABEL_KEYS = {
  event_type: 'audit.col.eventType',
  actor: 'audit.col.actor',
  project: 'audit.col.project',
  action: 'audit.col.action',
  resource: 'audit.col.resource',
  timestamp: 'audit.col.timestamp',
  status: 'audit.col.status',
} as const;

export const AUDIT_TABLE_COLUMN_LAYOUT = [
  { key: 'event_type' as const, flex: 1.15, minWidth: 128 },
  { key: 'actor' as const, flex: 0.75, minWidth: 88 },
  { key: 'project' as const, flex: 0.55, minWidth: 72 },
  { key: 'action' as const, flex: 1.05, minWidth: 120 },
  { key: 'resource' as const, flex: 0.95, minWidth: 120 },
  { key: 'timestamp' as const, flex: 1.05, minWidth: 148 },
  { key: 'status' as const, flex: 0.65, minWidth: 88 },
] as const;
