import type {
  SharePointCredentialInput,
  SharePointCredentialStatus,
  SharePointDrive,
  SharePointIntegration,
  SharePointSite,
  SharePointSourcesSelection,
  SharePointSyncJob,
} from '@/features/crawl/types/sharepoint.types';
import { API_CONFIG } from '@/network/apiUrl';
import { get, post } from '@/network/request';

function withProjectId(path: string, projectId: string, extra?: Record<string, string | number>): string {
  const params = new URLSearchParams({ project_id: projectId });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, String(value));
    }
  }
  return `${path}?${params.toString()}`;
}

export async function handleUpsertSharePointCredentials(
  payload: SharePointCredentialInput,
): Promise<SharePointCredentialStatus> {
  const body = await post<SharePointCredentialInput, SharePointCredentialStatus>(
    API_CONFIG.SHAREPOINT_CREDENTIALS,
    payload,
  );
  return body as SharePointCredentialStatus;
}

export async function handleGetSharePointCredentialStatus(projectId: string): Promise<SharePointCredentialStatus> {
  const body = await get<SharePointCredentialStatus>(withProjectId(API_CONFIG.SHAREPOINT_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as SharePointCredentialStatus;
}

export async function handleGetSharePointAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.SHAREPOINT_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.sharepoint.authUrlFailed');
}

export async function handleGetSharePointStatus(projectId: string): Promise<SharePointIntegration | null> {
  try {
    const body = await get<SharePointIntegration | null>(withProjectId(API_CONFIG.SHAREPOINT_STATUS, projectId));
    return (body ?? null) as SharePointIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleListSharePointSites(projectId: string, query = '*'): Promise<SharePointSite[]> {
  const body = await get<SharePointSite[]>(withProjectId(API_CONFIG.SHAREPOINT_SITES, projectId, { query }));
  return Array.isArray(body) ? body : [];
}

export async function handleListSharePointDrives(projectId: string, siteId: string): Promise<SharePointDrive[]> {
  const body = await get<SharePointDrive[]>(
    withProjectId(API_CONFIG.SHAREPOINT_DRIVES, projectId, { site_id: siteId }),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleSaveSharePointSources(
  projectId: string,
  selection: SharePointSourcesSelection,
): Promise<SharePointIntegration> {
  const body = await post(API_CONFIG.SHAREPOINT_SOURCES, {
    project_id: projectId,
    sites: selection.sites,
    drives: selection.drives,
  });
  return body as unknown as SharePointIntegration;
}

export async function handleSaveSharePointSettings(
  projectId: string,
  settings: SharePointIntegration['settings'],
): Promise<SharePointIntegration> {
  const body = await post(API_CONFIG.SHAREPOINT_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as SharePointIntegration;
}

export async function handleTriggerSharePointSync(projectId: string): Promise<SharePointSyncJob> {
  const body = await post<null, SharePointSyncJob>(withProjectId(API_CONFIG.SHAREPOINT_SYNC, projectId));
  return body as SharePointSyncJob;
}

export async function handleGetSharePointJobs(projectId: string): Promise<SharePointSyncJob[]> {
  const body = await get<SharePointSyncJob[]>(withProjectId(API_CONFIG.SHAREPOINT_JOBS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handlePauseSharePoint(projectId: string): Promise<SharePointIntegration> {
  const body = await post<null, SharePointIntegration>(withProjectId(API_CONFIG.SHAREPOINT_PAUSE, projectId));
  return body as SharePointIntegration;
}

export async function handleResumeSharePoint(projectId: string): Promise<SharePointIntegration> {
  const body = await post<null, SharePointIntegration>(withProjectId(API_CONFIG.SHAREPOINT_RESUME, projectId));
  return body as SharePointIntegration;
}

export async function handleDisconnectSharePoint(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.SHAREPOINT_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
