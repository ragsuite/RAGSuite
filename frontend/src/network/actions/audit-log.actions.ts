import type {
  AuditLogExportParams,
  AuditLogExportResult,
  AuditLogFilterParams,
  AuditLogQueryParams,
} from '@/features/audit-logs/types/audit-log.types';
import type { AuditEventListOut } from '@/features/audit-logs/types/audit-log.api.types';
import { mapAuditEventOut } from '@/features/audit-logs/utils/audit-log-mappers';
import {
  buildAuditLogExportFilename,
  mimeTypeForAuditLogExport,
} from '@/features/audit-logs/utils/audit-log-export';
import { API_CONFIG } from '@/network/apiUrl';
import { get, getText } from '@/network/request';
import { filenameFromContentDisposition } from '@/shared/utils/content-disposition';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProjectUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Filter → query mapping shared by the list and export endpoints. */
function appendAuditFilterParams(search: URLSearchParams, params: AuditLogFilterParams): void {
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
}

export function buildAuditEventsQuery(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  appendAuditFilterParams(search, params);
  return `${API_CONFIG.AUDIT_EVENTS}?${search.toString()}`;
}

export function buildAuditEventsExportQuery(params: AuditLogExportParams): string {
  const search = new URLSearchParams();
  search.set('format', params.format);
  if (params.limit != null) {
    search.set('limit', String(params.limit));
  }
  appendAuditFilterParams(search, params);
  return `${API_CONFIG.AUDIT_EVENTS_EXPORT}?${search.toString()}`;
}

export async function handleGetAuditEvents(params: AuditLogQueryParams) {
  const response = (await get<AuditEventListOut>(buildAuditEventsQuery(params))) as AuditEventListOut;
  return {
    events: response.events.map(mapAuditEventOut),
    total: response.total,
    limit: response.limit,
    offset: response.offset,
    retentionDays: response.retention_days ?? null,
  };
}

export async function handleGetAuditEventById(id: string) {
  const response = (await get(API_CONFIG.auditEvent(id))) as AuditEventListOut['events'][number];
  return mapAuditEventOut(response);
}

export async function handleExportAuditEvents(
  params: AuditLogExportParams,
): Promise<AuditLogExportResult> {
  const { body, contentType, contentDisposition } = await getText(buildAuditEventsExportQuery(params));
  const { format } = params;
  return {
    content: body,
    format,
    filename: buildAuditLogExportFilename(format, filenameFromContentDisposition(contentDisposition)),
    mimeType: contentType?.split(';')[0]?.trim() || mimeTypeForAuditLogExport(format),
  };
}
