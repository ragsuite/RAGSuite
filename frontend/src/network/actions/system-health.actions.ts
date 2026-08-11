import type { SystemHealthApiPayload } from '@/features/system-health/types/systemHealth.types';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

export async function handleGetSystemHealth(): Promise<SystemHealthApiPayload> {
  return (await get<SystemHealthApiPayload>(API_CONFIG.SYSTEM_HEALTH)) as SystemHealthApiPayload;
}
