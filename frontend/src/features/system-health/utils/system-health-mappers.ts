import { CORE_SERVICE_NAMES } from '@/features/system-health/system-health.constants';
import type {
  HealthStatus,
  ServiceHealthDetailPayload,
  SystemHealthApiPayload,
  SystemHealthSnapshot,
} from '@/features/system-health/types/systemHealth.types';

export const SYSTEM_HEALTH_INVALID_PAYLOAD = 'system-health.error.invalidPayload';

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isServiceMap(value: unknown): value is Record<string, ServiceHealthDetailPayload> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isSystemHealthApiPayload(value: unknown): value is SystemHealthApiPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isServiceMap(record.services);
}

export function normalizeHealthStatus(status: string | null | undefined): HealthStatus {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (normalized === 'healthy' || normalized === 'up' || normalized === 'ok') {
    return 'healthy';
  }
  if (normalized === 'at_risk' || normalized === 'atrisk') {
    return 'at_risk';
  }
  if (normalized === 'degraded' || normalized === 'warning' || normalized === 'partial') {
    return 'degraded';
  }
  return 'down';
}

/** Reference sort: core → LLM (* API) → alphabetical. */
export function sortServiceNames(names: string[]): string[] {
  const core = new Set<string>(CORE_SERVICE_NAMES);
  return [...names].sort((a, b) => {
    const aIsCore = core.has(a);
    const bIsCore = core.has(b);
    const aIsLlm = a.includes(' API');
    const bIsLlm = b.includes(' API');

    if (aIsCore && !bIsCore) return -1;
    if (!aIsCore && bIsCore) return 1;
    if (aIsLlm && !bIsLlm && !aIsCore && !bIsCore) return -1;
    if (!aIsLlm && bIsLlm && !aIsCore && !bIsCore) return 1;
    return a.localeCompare(b);
  });
}

export function mapPayloadToSnapshot(payload: SystemHealthApiPayload): SystemHealthSnapshot {
  if (!isSystemHealthApiPayload(payload)) {
    throw new Error(SYSTEM_HEALTH_INVALID_PAYLOAD);
  }

  const serviceMap = payload.services;
  const serviceNames = sortServiceNames(Object.keys(serviceMap));

  const services = serviceNames.map((name) => {
    const row = serviceMap[name];
    if (!row) {
      throw new Error(`Missing service "${name}" in health payload`);
    }

    return {
      id: slugify(name),
      name,
      status: normalizeHealthStatus(row.status),
      uptimePercent: row.uptime_percent,
      lastHeartbeatSeconds: row.last_heartbeat_seconds ?? null,
      healthScore: row.health_score,
      reason: row.reason ?? null,
      predictedFailureMinutes: row.predicted_failure_minutes ?? null,
    };
  });

  return {
    timestamp: payload.timestamp,
    overallHealthScore: payload.overall_health_score,
    overallStatus: normalizeHealthStatus(payload.overall_status),
    services,
  };
}
