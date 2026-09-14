import type {
  TeamsChannel,
  TeamsCredentialInput,
  TeamsCredentialStatus,
  TeamsIntegration,
  TeamsSourcesSelection,
  TeamsSyncJob,
  TeamsTeam,
} from '@/features/crawl/types/teams.types';
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

export async function handleUpsertTeamsCredentials(
  payload: TeamsCredentialInput,
): Promise<TeamsCredentialStatus> {
  const body = await post<TeamsCredentialInput, TeamsCredentialStatus>(API_CONFIG.TEAMS_CREDENTIALS, payload);
  return body as TeamsCredentialStatus;
}

export async function handleGetTeamsCredentialStatus(projectId: string): Promise<TeamsCredentialStatus> {
  const body = await get<TeamsCredentialStatus>(withProjectId(API_CONFIG.TEAMS_CREDENTIALS_STATUS, projectId));
  return (body ?? { configured: false }) as TeamsCredentialStatus;
}

export async function handleGetTeamsAuthUrl(projectId: string): Promise<string> {
  const body = await get(withProjectId(API_CONFIG.TEAMS_AUTH_START, projectId));
  const data = body as { auth_url?: string };
  if (typeof data?.auth_url === 'string') {
    return data.auth_url;
  }
  throw new Error('errors.teams.authUrlFailed');
}

export async function handleGetTeamsStatus(projectId: string): Promise<TeamsIntegration | null> {
  try {
    const body = await get<TeamsIntegration | null>(withProjectId(API_CONFIG.TEAMS_STATUS, projectId));
    return (body ?? null) as TeamsIntegration | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/404|not found/i.test(message)) return null;
    throw error;
  }
}

export async function handleListTeamsTeams(projectId: string): Promise<TeamsTeam[]> {
  const body = await get<TeamsTeam[]>(withProjectId(API_CONFIG.TEAMS_TEAMS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handleListTeamsChannels(projectId: string, teamId: string): Promise<TeamsChannel[]> {
  const body = await get<TeamsChannel[]>(
    withProjectId(API_CONFIG.TEAMS_CHANNELS, projectId, { team_id: teamId }),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleSaveTeamsSources(
  projectId: string,
  selection: TeamsSourcesSelection,
): Promise<TeamsIntegration> {
  const body = await post(API_CONFIG.TEAMS_SOURCES, {
    project_id: projectId,
    teams: selection.teams,
    channels: selection.channels,
  });
  return body as unknown as TeamsIntegration;
}

export async function handleSaveTeamsSettings(
  projectId: string,
  settings: TeamsIntegration['settings'],
): Promise<TeamsIntegration> {
  const body = await post(API_CONFIG.TEAMS_SETTINGS, {
    project_id: projectId,
    settings,
  });
  return body as unknown as TeamsIntegration;
}

export async function handleTriggerTeamsSync(projectId: string): Promise<TeamsSyncJob> {
  const body = await post<null, TeamsSyncJob>(withProjectId(API_CONFIG.TEAMS_SYNC, projectId));
  return body as TeamsSyncJob;
}

export async function handleGetTeamsJobs(projectId: string): Promise<TeamsSyncJob[]> {
  const body = await get<TeamsSyncJob[]>(withProjectId(API_CONFIG.TEAMS_JOBS, projectId));
  return Array.isArray(body) ? body : [];
}

export async function handlePauseTeams(projectId: string): Promise<TeamsIntegration> {
  const body = await post<null, TeamsIntegration>(withProjectId(API_CONFIG.TEAMS_PAUSE, projectId));
  return body as TeamsIntegration;
}

export async function handleResumeTeams(projectId: string): Promise<TeamsIntegration> {
  const body = await post<null, TeamsIntegration>(withProjectId(API_CONFIG.TEAMS_RESUME, projectId));
  return body as TeamsIntegration;
}

export async function handleDisconnectTeams(projectId: string): Promise<{ message: string }> {
  const body = await post<null, { message: string }>(withProjectId(API_CONFIG.TEAMS_DISCONNECT, projectId));
  return (body ?? { message: 'Disconnected' }) as { message: string };
}
