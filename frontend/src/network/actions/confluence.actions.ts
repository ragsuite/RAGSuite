import type {
  ConfluenceCredentialInput,
  ConfluenceCredentialStatus,
  ConfluenceIntegration,
  ConfluenceSpace,
  ConfluenceSourcesSelection,
  ConfluenceSyncJob,
} from '@/features/crawl/types/confluence.types';
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

export async function handleUpsertConfluenceCredentials(
  payload: ConfluenceCredentialInput,
): Promise<ConfluenceCredentialStatus> {
  const body = await post<ConfluenceCredentialInput, ConfluenceCredentialStatus>(
    API_CONFIG.CONFLUENCE_CREDENTIALS,
    payload,
  );
  return body as ConfluenceCredentialStatus;
}

export async function handleGetConfluenceCredentialStatus(projectId: string): Promise<ConfluenceCredentialStatus> {
  const body = await get<ConfluenceCredentialStatus>(withProjectId(API_CONFIG.CONFLUENCE_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as ConfluenceCredentialStatus;
}

export async function handleGetConfluenceAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.CONFLUENCE_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.confluence.authUrlFailed');
}

export async function handleGetConfluenceStatus(projectId: string): Promise<ConfluenceIntegration | null> {
  try {
    const body = await get<ConfluenceIntegration | null>(withProjectId(API_CONFIG.CONFLUENCE_STATUS, projectId));
    return (body ?? null) as ConfluenceIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleListConfluenceSpaces(projectId: string): Promise<ConfluenceSpace[]> {
  const body = await get<ConfluenceSpace[]>(withProjectId(API_CONFIG.CONFLUENCE_SPACES, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handleSaveConfluenceSources(
  projectId: string,
  selection: ConfluenceSourcesSelection,
): Promise<ConfluenceIntegration> {
  const body = await post(API_CONFIG.CONFLUENCE_SOURCES, {
    project_id: projectId,
    spaces: selection.spaces,
    pages: selection.pages,
  });
  return body as unknown as ConfluenceIntegration;
}

export async function handleSaveConfluenceSettings(
  projectId: string,
  settings: ConfluenceIntegration['settings'],
): Promise<ConfluenceIntegration> {
  const body = await post(API_CONFIG.CONFLUENCE_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as ConfluenceIntegration;
}

export async function handleTriggerConfluenceSync(projectId: string): Promise<ConfluenceSyncJob> {
  const body = await post<null, ConfluenceSyncJob>(withProjectId(API_CONFIG.CONFLUENCE_SYNC, projectId));
  return body as ConfluenceSyncJob;
}

export async function handleGetConfluenceJobs(projectId: string): Promise<ConfluenceSyncJob[]> {
  const body = await get<ConfluenceSyncJob[]>(withProjectId(API_CONFIG.CONFLUENCE_JOBS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handlePauseConfluence(projectId: string): Promise<ConfluenceIntegration> {
  const body = await post<null, ConfluenceIntegration>(withProjectId(API_CONFIG.CONFLUENCE_PAUSE, projectId));
  return body as ConfluenceIntegration;
}

export async function handleResumeConfluence(projectId: string): Promise<ConfluenceIntegration> {
  const body = await post<null, ConfluenceIntegration>(withProjectId(API_CONFIG.CONFLUENCE_RESUME, projectId));
  return body as ConfluenceIntegration;
}

export async function handleDisconnectConfluence(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.CONFLUENCE_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
