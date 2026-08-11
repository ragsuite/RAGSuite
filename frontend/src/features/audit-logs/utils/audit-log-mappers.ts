import type { AuditEventOut } from '@/features/audit-logs/types/audit-log.api.types';
import type {
  AuditActor,
  AuditActorType,
  AuditCategory,
  AuditEvent,
  AuditSeverity,
  AuditStatus,
} from '@/features/audit-logs/types/audit-log.types';

const CATEGORIES: AuditCategory[] = ['identity', 'integration', 'data', 'config'];
const SEVERITIES: AuditSeverity[] = ['low', 'medium', 'high', 'critical'];
const STATUSES: AuditStatus[] = ['success', 'failure', 'warning'];
const ACTOR_TYPES: AuditActorType[] = ['user', 'api_key', 'system'];

function normalizeEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const normalized = value.trim().toLowerCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function mapActor(actor: AuditEventOut['actor']): AuditActor | null {
  if (!actor) return null;
  if (actor.id == null && !actor.username && !actor.email) return null;
  return {
    id: actor.id ?? 0,
    username: actor.username ?? '',
    email: actor.email ?? '',
  };
}

export function mapAuditEventOut(row: AuditEventOut): AuditEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    project_id: row.project_id ?? null,
    project_name: row.project_name ?? null,
    user_id: row.user_id ?? null,
    api_key_id: row.api_key_id ?? null,
    actor_type: normalizeEnum(row.actor_type, ACTOR_TYPES, 'system'),
    actor: mapActor(row.actor),
    event_type: row.event_type,
    category: normalizeEnum(row.category, CATEGORIES, 'config'),
    severity: normalizeEnum(row.severity, SEVERITIES, 'low'),
    status: normalizeEnum(row.status, STATUSES, 'success'),
    action: row.action,
    resource_type: row.resource_type ?? null,
    resource_id: row.resource_id ?? null,
    summary: row.summary,
    details: row.details ?? null,
    ip_address: row.ip_address ?? null,
    user_agent: row.user_agent ?? null,
  };
}
