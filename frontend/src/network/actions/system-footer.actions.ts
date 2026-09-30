import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

export type SystemFooterResponse = {
  show_system_footer: boolean;
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetSystemFooter(): Promise<SystemFooterResponse> {
  const body = await get<SystemFooterResponse>(API_CONFIG.SETTINGS_SYSTEM_FOOTER);
  return unwrapBody<SystemFooterResponse>(body);
}
