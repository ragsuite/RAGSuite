import { SERVICE_DISPLAY_ORDER } from '@/features/system-health/system-health.constants';
import type { SystemHealthSnapshot } from '@/features/system-health/types/systemHealth.types';
import { mapPayloadToSnapshot } from '@/features/system-health/utils/system-health-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { handleGetSystemHealth } from '@/network/actions/system-health.actions';

export { SERVICE_DISPLAY_ORDER };

export const SYSTEM_HEALTH_API = {
  dashboard: API_CONFIG.SYSTEM_HEALTH,
} as const;

export async function fetchSystemHealth(): Promise<SystemHealthSnapshot> {
  const payload = await handleGetSystemHealth();
  return mapPayloadToSnapshot(payload);
}
