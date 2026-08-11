import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';

const cache = new Map<string, AuditEvent>();

export function cacheAuditEvent(event: AuditEvent): void {
  cache.set(event.id, event);
}

export function getCachedAuditEvent(eventId: string): AuditEvent | undefined {
  return cache.get(eventId);
}

export function clearAuditEventCache(): void {
  cache.clear();
}
