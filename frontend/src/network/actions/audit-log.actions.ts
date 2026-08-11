import type { AuditLogQueryParams } from '@/features/audit-logs/types/audit-log.types';
import type { AuditEventListOut } from '@/features/audit-logs/types/audit-log.api.types';
import { mapAuditEventOut } from '@/features/audit-logs/utils/audit-log-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProjectUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function buildAuditEventsQuery(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));

  if (params.q?.trim()) {
    search.set('q', params.q.trim());
  }
  if (params.category && params.category !== 'all') {
    search.set('category', params.category);
  }
  if (params.severity && params.severity !== 'all') {
    search.set('severity', params.severity);
  }
  if (params.status && params.status !== 'all') {
    search.set('status', params.status);
  }

  const project = params.project ?? 'all';
  if (project === 'all') {
    search.set('all_projects', 'true');
  } else if (project === 'account') {
    search.set('account_only', 'true');
  } else if (project === 'active') {
    // Omit project_id — API scopes to the active project.
  } else if (isProjectUuid(project)) {
    search.set('project_id', project);
  }

  return `${API_CONFIG.AUDIT_EVENTS}?${search.toString()}`;
}

export async function handleGetAuditEvents(params: AuditLogQueryParams) {
  const response = (await get<AuditEventListOut>(buildAuditEventsQuery(params))) as AuditEventListOut;
  return {
    events: response.events.map(mapAuditEventOut),
    total: response.total,
    limit: response.limit,
    offset: response.offset,
  };
}

export async function handleGetAuditEventById(id: string) {
  const response = (await get(API_CONFIG.auditEvent(id))) as AuditEventListOut['events'][number];
  return mapAuditEventOut(response);
}
