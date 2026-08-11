import {
  handleGetAuditEventById,
  handleGetAuditEvents,
} from '@/network/actions/audit-log.actions';
import type {
  AuditEvent,
  AuditEventsResponse,
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
} as const;

export { cacheAuditEvent, getCachedAuditEvent };

export async function fetchAuditEvents(params: AuditLogQueryParams): Promise<AuditEventsResponse> {
  const response = await handleGetAuditEvents(params);
  response.events.forEach((event) => cacheAuditEvent(event));
  return response;
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
