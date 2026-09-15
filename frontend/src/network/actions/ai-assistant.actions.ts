import type {
  AiAssistantCapabilities,
  AiAssistantChatEvent,
  AiAssistantMessage,
  AiAssistantSession,
  AiAssistantSettings,
  AiAssistantSettingsUpdate,
} from '@/features/ai-assistant/types/ai-assistant.types';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import { getAccessToken } from '@/network/auth-session';
import { deleteApi, get, patch, post, put } from '@/network/request';

function withProjectId(path: string, projectId: string): string {
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}project_id=${encodeURIComponent(projectId)}`;
}

export async function handleGetAiAssistantCapabilities(
  projectId: string,
): Promise<AiAssistantCapabilities> {
  const body = await get<AiAssistantCapabilities>(
    withProjectId(API_CONFIG.AI_ASSISTANT_CAPABILITIES, projectId),
  );
  return (
    body ?? {
      voice: false,
      voice_stt: false,
      voice_tts: false,
    }
  );
}

export async function handleGetAiAssistantSettings(projectId: string): Promise<AiAssistantSettings> {
  const body = await get<AiAssistantSettings>(
    withProjectId(API_CONFIG.AI_ASSISTANT_SETTINGS, projectId),
  );
  return (
    body ?? {
      configured: false,
      model_provider: 'openai',
      has_api_key: false,
    }
  );
}

export async function handlePutAiAssistantSettings(
  projectId: string,
  payload: AiAssistantSettingsUpdate,
): Promise<AiAssistantSettings> {
  const body = await put<AiAssistantSettingsUpdate, AiAssistantSettings>(
    withProjectId(API_CONFIG.AI_ASSISTANT_SETTINGS, projectId),
    payload,
  );
  return body as AiAssistantSettings;
}

export async function handleTestAiAssistantSettings(
  projectId: string,
  payload: AiAssistantSettingsUpdate,
): Promise<{ ok: boolean; message: string }> {
  const body = await post<AiAssistantSettingsUpdate, { ok: boolean; message: string }>(
    withProjectId(API_CONFIG.AI_ASSISTANT_SETTINGS_TEST, projectId),
    payload,
  );
  return body ?? { ok: false, message: 'No response' };
}

export async function handleListAiAssistantSessions(projectId: string): Promise<AiAssistantSession[]> {
  const body = await get<AiAssistantSession[]>(
    withProjectId(API_CONFIG.AI_ASSISTANT_SESSIONS, projectId),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleCreateAiAssistantSession(
  projectId: string,
  title?: string,
): Promise<AiAssistantSession> {
  const body = await post<{ title?: string }, AiAssistantSession>(
    withProjectId(API_CONFIG.AI_ASSISTANT_SESSIONS, projectId),
    title ? { title } : {},
  );
  return body as AiAssistantSession;
}

export async function handleRenameAiAssistantSession(
  projectId: string,
  sessionId: string,
  title: string,
): Promise<AiAssistantSession> {
  const body = await patch<{ title: string }, AiAssistantSession>(
    withProjectId(API_CONFIG.aiAssistantSession(sessionId), projectId),
    { title },
  );
  return body as AiAssistantSession;
}

export async function handleDeleteAiAssistantSession(
  projectId: string,
  sessionId: string,
): Promise<void> {
  await deleteApi(withProjectId(API_CONFIG.aiAssistantSession(sessionId), projectId));
}

export async function handleListAiAssistantMessages(
  projectId: string,
  sessionId: string,
): Promise<AiAssistantMessage[]> {
  const body = await get<AiAssistantMessage[]>(
    withProjectId(API_CONFIG.aiAssistantSessionMessages(sessionId), projectId),
  );
  return Array.isArray(body) ? body : [];
}

export async function handleStreamAiAssistantChat(
  projectId: string,
  sessionId: string,
  message: string,
  onEvent: (event: AiAssistantChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const url = buildApiUrl(withProjectId(API_CONFIG.aiAssistantSessionChat(sessionId), projectId));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['X-Project-Id'] = projectId;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `AI Assistant chat failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error('AI Assistant stream unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data:'));
      if (!line) continue;
      const raw = line.replace(/^data:\s*/, '');
      try {
        onEvent(JSON.parse(raw) as AiAssistantChatEvent);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
