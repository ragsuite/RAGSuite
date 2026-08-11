import type {
  GmailCredentialInput,
  GmailCredentialStatus,
  GmailInboxIndexResult,
  GmailInboxPage,
  GmailIntegration,
  GmailSyncJob,
} from '@/features/crawl/types/crawl.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post } from '@/network/request';

function withProjectId(path: string, projectId: string, extra?: Record<string, string | number>): string {
  const params = new URLSearchParams({ project_id: projectId });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, String(value));
    }
  }
  return `${path}?${params.toString()}`;
}

export async function handleUpsertGmailCredentials(payload: GmailCredentialInput): Promise<GmailCredentialStatus> {
  const body = await post<GmailCredentialInput, GmailCredentialStatus>(API_CONFIG.GMAIL_CREDENTIALS, payload);
  return body as GmailCredentialStatus;
}

export async function handleGetGmailCredentialStatus(projectId: string): Promise<GmailCredentialStatus> {
  const body = await get<GmailCredentialStatus>(withProjectId(API_CONFIG.GMAIL_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as GmailCredentialStatus;
}

export async function handleGetGmailAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.GMAIL_AUTH_URL, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.gmail.authUrlFailed');
}

export async function handleGetGmailStatus(projectId: string): Promise<GmailIntegration | null> {
  try {
    const body = await get<GmailIntegration | null>(withProjectId(API_CONFIG.GMAIL_STATUS, projectId));
    return (body ?? null) as GmailIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleTriggerGmailSync(projectId: string): Promise<GmailSyncJob> {
  const body = await post<null, GmailSyncJob>(withProjectId(API_CONFIG.GMAIL_SYNC, projectId));
  return body as GmailSyncJob;
}

export async function handlePauseGmail(projectId: string): Promise<GmailIntegration> {
  const body = await post<null, GmailIntegration>(withProjectId(API_CONFIG.GMAIL_PAUSE, projectId));
  return body as GmailIntegration;
}

export async function handleResumeGmail(projectId: string): Promise<GmailIntegration> {
  const body = await post<null, GmailIntegration>(withProjectId(API_CONFIG.GMAIL_RESUME, projectId));
  return body as GmailIntegration;
}

export async function handleDisconnectGmail(projectId: string): Promise<{ message: string }> {
  const body = await deleteApi<{ message: string }>(withProjectId(API_CONFIG.GMAIL_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}

export async function handleGetGmailJobs(projectId: string, limit = 20): Promise<GmailSyncJob[]> {
  const body = await get<GmailSyncJob[]>(withProjectId(API_CONFIG.GMAIL_JOBS, projectId, { limit }));
  return Array.isArray(body) ? body : [];
}

export async function handleListGmailInbox(
  projectId: string,
  limit = 50,
  offset = 0,
): Promise<GmailInboxPage> {
  const body = await get<GmailInboxPage>(
    withProjectId(API_CONFIG.GMAIL_INBOX, projectId, { limit, offset }),
  );
  if (body && typeof body === 'object' && 'items' in body) {
    return body as GmailInboxPage;
  }
  return { total: 0, items: [] };
}

export async function handleIndexGmailInbox(
  projectId: string,
  stagedIds: string[],
  allInbox = false,
): Promise<GmailInboxIndexResult> {
  const body = await post(API_CONFIG.GMAIL_INBOX_INDEX, {
    project_id: projectId,
    staged_ids: stagedIds,
    all_inbox: allInbox,
  });
  return body as unknown as GmailInboxIndexResult;
}

export async function handleDismissGmailInbox(
  projectId: string,
  stagedIds: string[],
  allInbox = false,
): Promise<{ removed: number }> {
  const body = await post(API_CONFIG.GMAIL_INBOX_DISMISS, {
    project_id: projectId,
    staged_ids: stagedIds,
    all_inbox: allInbox,
  });
  return (body as unknown as { removed: number }) ?? { removed: 0 };
}
