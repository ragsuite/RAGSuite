import type {
  NotionCredentialInput,
  NotionCredentialStatus,
  NotionIntegration,
  NotionSearchItem,
  NotionSourcesSelection,
  NotionSyncJob,
} from '@/features/crawl/types/notion.types';
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

export async function handleUpsertNotionCredentials(payload: NotionCredentialInput): Promise<NotionCredentialStatus> {
  const body = await post<NotionCredentialInput, NotionCredentialStatus>(API_CONFIG.NOTION_CREDENTIALS, payload);
  return body as NotionCredentialStatus;
}

export async function handleGetNotionCredentialStatus(projectId: string): Promise<NotionCredentialStatus> {
  const body = await get<NotionCredentialStatus>(withProjectId(API_CONFIG.NOTION_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as NotionCredentialStatus;
}

export async function handleGetNotionAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.NOTION_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.notion.authUrlFailed');
}

export async function handleGetNotionStatus(projectId: string): Promise<NotionIntegration | null> {
  try {
    const body = await get<NotionIntegration | null>(withProjectId(API_CONFIG.NOTION_STATUS, projectId));
    return (body ?? null) as NotionIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleSearchNotion(projectId: string, query = ''): Promise<NotionSearchItem[]> {
  const body = await get<NotionSearchItem[]>(withProjectId(API_CONFIG.NOTION_SEARCH, projectId, { query }));
  return Array.isArray(body) ? body : [];
}

export async function handleSaveNotionSources(
  projectId: string,
  selection: NotionSourcesSelection,
): Promise<NotionIntegration> {
  const body = await post(API_CONFIG.NOTION_SOURCES, {
    project_id: projectId,
    pages: selection.pages,
    databases: selection.databases,
  });
  return body as unknown as NotionIntegration;
}

export async function handleSaveNotionSettings(
  projectId: string,
  settings: NotionIntegration['settings'],
): Promise<NotionIntegration> {
  const body = await post(API_CONFIG.NOTION_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as NotionIntegration;
}

export async function handleTriggerNotionSync(projectId: string): Promise<NotionSyncJob> {
  const body = await post<null, NotionSyncJob>(withProjectId(API_CONFIG.NOTION_SYNC, projectId));
  return body as NotionSyncJob;
}

export async function handleGetNotionJobs(projectId: string): Promise<NotionSyncJob[]> {
  const body = await get<NotionSyncJob[]>(withProjectId(API_CONFIG.NOTION_JOBS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handlePauseNotion(projectId: string): Promise<NotionIntegration> {
  const body = await post<null, NotionIntegration>(withProjectId(API_CONFIG.NOTION_PAUSE, projectId));
  return body as NotionIntegration;
}

export async function handleResumeNotion(projectId: string): Promise<NotionIntegration> {
  const body = await post<null, NotionIntegration>(withProjectId(API_CONFIG.NOTION_RESUME, projectId));
  return body as NotionIntegration;
}

export async function handleDisconnectNotion(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.NOTION_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
