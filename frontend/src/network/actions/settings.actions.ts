import type {
  WorkspaceSettingsRequest,
  WorkspaceSettingsResponse,
} from '@/features/settings/types/settings.api.types';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { API_CONFIG } from '@/network/apiUrl';
import { get, post } from '@/network/request';

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettingsResponse = {
  org_name: BRANDING_DEFAULTS.orgName,
  logo_data_url: BRANDING_DEFAULTS.logoDataUrl,
  primary_color: BRANDING_DEFAULTS.primaryColor,
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetWorkspaceSettings(): Promise<WorkspaceSettingsResponse> {
  try {
    const body = await get<WorkspaceSettingsResponse>(API_CONFIG.WORKSPACE_SETTINGS);
    return unwrapBody<WorkspaceSettingsResponse>(body);
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

export async function handleSaveWorkspaceSettings(
  payload: WorkspaceSettingsRequest,
): Promise<WorkspaceSettingsResponse> {
  const body = await post<WorkspaceSettingsRequest, WorkspaceSettingsResponse>(
    API_CONFIG.WORKSPACE_SETTINGS,
    payload,
  );
  return unwrapBody<WorkspaceSettingsResponse>(body);
}
