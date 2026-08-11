import type {
  GoogleDriveBrowseItem,
  GoogleDriveCredentialInput,
  GoogleDriveCredentialStatus,
  GoogleDriveFolder,
  GoogleDriveIntegration,
  GoogleDriveSourcesSelection,
  GoogleDriveSyncJob,
} from '@/features/crawl/types/google-drive.types';
import { isConnectorFetchError, isConnectorNotFoundError } from '@/features/crawl/utils/connector-fetch-errors';
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

export async function handleUpsertGoogleDriveCredentials(
  payload: GoogleDriveCredentialInput,
): Promise<GoogleDriveCredentialStatus> {
  const body = await post<GoogleDriveCredentialInput, GoogleDriveCredentialStatus>(
    API_CONFIG.GOOGLE_DRIVE_CREDENTIALS,
    payload,
  );
  return body as GoogleDriveCredentialStatus;
}

export async function handleGetGoogleDriveCredentialStatus(projectId: string): Promise<GoogleDriveCredentialStatus> {
  try {
    const body = await get<GoogleDriveCredentialStatus>(
      withProjectId(API_CONFIG.GOOGLE_DRIVE_CREDENTIALS_STATUS, projectId),
    );
    return (body ?? { configured: false }) as GoogleDriveCredentialStatus;
  } catch (error) {
    if (isConnectorFetchError(error)) {
      return { configured: false };
    }
    throw error;
  }
}

export async function handleGetGoogleDriveAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.GOOGLE_DRIVE_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.googleDrive.authUrlFailed');
}

export async function handleGetGoogleDriveStatus(projectId: string): Promise<GoogleDriveIntegration | null> {
  try {
    const body = await get<GoogleDriveIntegration | null>(withProjectId(API_CONFIG.GOOGLE_DRIVE_STATUS, projectId));
    return (body ?? null) as GoogleDriveIntegration | null;
  } catch (error) {
    if (isConnectorNotFoundError(error) || isConnectorFetchError(error)) return null;
    throw error;
  }
}

export async function handleBrowseGoogleDrive(
  projectId: string,
  parentId = 'root',
): Promise<GoogleDriveBrowseItem[]> {
  const body = await get<GoogleDriveBrowseItem[]>(
    withProjectId(API_CONFIG.GOOGLE_DRIVE_BROWSE, projectId, { parent_id: parentId }),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleListGoogleDriveFolders(
  projectId: string,
  parentId = 'root',
): Promise<GoogleDriveFolder[]> {
  const body = await get<GoogleDriveFolder[]>(
    withProjectId(API_CONFIG.GOOGLE_DRIVE_FOLDERS, projectId, { parent_id: parentId }),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleSaveGoogleDriveSources(
  projectId: string,
  selection: GoogleDriveSourcesSelection,
): Promise<GoogleDriveIntegration> {
  const body = await post(API_CONFIG.GOOGLE_DRIVE_SOURCES, {
    project_id: projectId,
    folders: selection.folders,
    files: selection.files ?? [],
  });
  return body as unknown as GoogleDriveIntegration;
}

export async function handleSaveGoogleDriveSettings(
  projectId: string,
  settings: GoogleDriveIntegration['settings'],
): Promise<GoogleDriveIntegration> {
  const body = await post(API_CONFIG.GOOGLE_DRIVE_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as GoogleDriveIntegration;
}

export async function handleTriggerGoogleDriveSync(projectId: string): Promise<GoogleDriveSyncJob> {
  const body = await post<null, GoogleDriveSyncJob>(withProjectId(API_CONFIG.GOOGLE_DRIVE_SYNC, projectId));
  return body as GoogleDriveSyncJob;
}

export async function handleGetGoogleDriveJobs(projectId: string): Promise<GoogleDriveSyncJob[]> {
  try {
    const body = await get<GoogleDriveSyncJob[]>(withProjectId(API_CONFIG.GOOGLE_DRIVE_JOBS, projectId));
    return Array.isArray(body) ? body : [];
  } catch (error) {
    if (isConnectorFetchError(error)) return [];
    throw error;
  }
}

export async function handlePauseGoogleDrive(projectId: string): Promise<GoogleDriveIntegration> {
  const body = await post<null, GoogleDriveIntegration>(withProjectId(API_CONFIG.GOOGLE_DRIVE_PAUSE, projectId));
  return body as GoogleDriveIntegration;
}

export async function handleResumeGoogleDrive(projectId: string): Promise<GoogleDriveIntegration> {
  const body = await post<null, GoogleDriveIntegration>(withProjectId(API_CONFIG.GOOGLE_DRIVE_RESUME, projectId));
  return body as GoogleDriveIntegration;
}

export async function handleDisconnectGoogleDrive(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.GOOGLE_DRIVE_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
