import type { SystemHealthApiPayload } from '@/features/system-health/types/systemHealth.types';
import {
  isSystemHealthApiPayload,
  SYSTEM_HEALTH_INVALID_PAYLOAD,
} from '@/features/system-health/utils/system-health-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

function unwrapSystemHealthBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const record = body as Record<string, unknown>;
  // Error / envelope shapes without a dashboard services map.
  if (record.status === false && !isSystemHealthApiPayload(record)) {
    throw new Error(SYSTEM_HEALTH_INVALID_PAYLOAD);
  }
  if ('data' in record && record.data != null && typeof record.data === 'object') {
    return record.data;
  }
  return body;
}

export async function handleGetSystemHealth(): Promise<SystemHealthApiPayload> {
  const body = await get<SystemHealthApiPayload>(API_CONFIG.SYSTEM_HEALTH);
  const payload = unwrapSystemHealthBody(body);
  if (!isSystemHealthApiPayload(payload)) {
    throw new Error(SYSTEM_HEALTH_INVALID_PAYLOAD);
  }
  return payload;
}
