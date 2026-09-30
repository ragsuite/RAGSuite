import {
  handleExportAuditEvents,
  handleGetAuditEventById,
  handleGetAuditEvents,
} from '@/network/actions/audit-log.actions';
import type {
  AuditEvent,
  AuditEventsResponse,
  AuditLogExportParams,
  AuditLogExportResult,
  AuditLogQueryParams,
} from '@/features/audit-logs/types/audit-log.types';
import { API_CONFIG } from '@/network/apiUrl';
import {
  cacheAuditEvent,
  getCachedAuditEvent,
} from '@/features/audit-logs/utils/audit-log-event-cache';

export const AUDIT_LOG_API = {
  events: API_CONFIG.AUDIT_EVENTS,
  eventById: API_CONFIG.auditEvent,
  export: API_CONFIG.AUDIT_EVENTS_EXPORT,
} as const;

export { cacheAuditEvent, getCachedAuditEvent };

export async function fetchAuditEvents(params: AuditLogQueryParams): Promise<AuditEventsResponse> {
  const response = await handleGetAuditEvents(params);
  response.events.forEach((event) => cacheAuditEvent(event));
  return response;
}

/** Enterprise only — CE API has no export route (404 → caller shows error toast). */
export async function exportAuditEvents(params: AuditLogExportParams): Promise<AuditLogExportResult> {
  return handleExportAuditEvents(params);
}

export async function fetchAuditEventById(eventId: string): Promise<AuditEvent | null> {
  try {
    const event = await handleGetAuditEventById(eventId);
    cacheAuditEvent(event);
    return event;
  } catch (error) {
    const cached = getCachedAuditEvent(eventId);
    if (cached) {
      return cached;
    }
    throw error;
  }
}
