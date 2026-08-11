import type { Href } from 'expo-router';

import { AUDIT_LOGS_LIST_HREF } from '@/config/navigation';

export const auditLogsListHref = AUDIT_LOGS_LIST_HREF;

export function auditEventDetailRoute(eventId: string): Href {
  return `/(app)/audit-logs/${encodeURIComponent(eventId)}` as Href;
}
