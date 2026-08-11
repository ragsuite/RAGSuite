import type {
  SlackChannel,
  SlackCredentialInput,
  SlackCredentialStatus,
  SlackIntegration,
  SlackSourcesSelection,
  SlackSyncJob,
} from '@/features/crawl/types/slack.types';
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

export async function handleUpsertSlackCredentials(payload: SlackCredentialInput): Promise<SlackCredentialStatus> {
  const body = await post<SlackCredentialInput, SlackCredentialStatus>(API_CONFIG.SLACK_CREDENTIALS, payload);
  return body as SlackCredentialStatus;
}

export async function handleGetSlackCredentialStatus(projectId: string): Promise<SlackCredentialStatus> {
  const body = await get<SlackCredentialStatus>(withProjectId(API_CONFIG.SLACK_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as SlackCredentialStatus;
}

export async function handleGetSlackAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.SLACK_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.slack.authUrlFailed');
}

export async function handleGetSlackStatus(projectId: string): Promise<SlackIntegration | null> {
  try {
    const body = await get<SlackIntegration | null>(withProjectId(API_CONFIG.SLACK_STATUS, projectId));
    return (body ?? null) as SlackIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleListSlackChannels(projectId: string): Promise<SlackChannel[]> {
  const body = await get<SlackChannel[]>(withProjectId(API_CONFIG.SLACK_CHANNELS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handleSaveSlackSources(
  projectId: string,
  selection: SlackSourcesSelection,
): Promise<SlackIntegration> {
  const body = await post(API_CONFIG.SLACK_SOURCES, {
    project_id: projectId,
    channels: selection.channels,
  });
  return body as unknown as SlackIntegration;
}

export async function handleSaveSlackSettings(
  projectId: string,
  settings: SlackIntegration['settings'],
): Promise<SlackIntegration> {
  const body = await post(API_CONFIG.SLACK_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as SlackIntegration;
}

export async function handleTriggerSlackSync(projectId: string): Promise<SlackSyncJob> {
  const body = await post<null, SlackSyncJob>(withProjectId(API_CONFIG.SLACK_SYNC, projectId));
  return body as SlackSyncJob;
}

export async function handleGetSlackJobs(projectId: string): Promise<SlackSyncJob[]> {
  const body = await get<SlackSyncJob[]>(withProjectId(API_CONFIG.SLACK_JOBS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handlePauseSlack(projectId: string): Promise<SlackIntegration> {
  const body = await post<null, SlackIntegration>(withProjectId(API_CONFIG.SLACK_PAUSE, projectId));
  return body as SlackIntegration;
}

export async function handleResumeSlack(projectId: string): Promise<SlackIntegration> {
  const body = await post<null, SlackIntegration>(withProjectId(API_CONFIG.SLACK_RESUME, projectId));
  return body as SlackIntegration;
}

export async function handleDisconnectSlack(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.SLACK_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
