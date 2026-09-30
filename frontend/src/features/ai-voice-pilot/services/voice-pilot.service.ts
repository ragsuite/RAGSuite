import type {
  VoicePilotSettings,
  VoicePilotSettingsUpdate,
  VoicePilotTurnResponse,
  VoicePilotVoice,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { DEFAULT_VOICE_PREVIEW_TEXT } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { API_CONFIG } from '@/network/apiUrl';
import { fetchWithAuth, get, post, put } from '@/network/request';

function withProjectId(path: string, projectId: string): string {
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}project_id=${encodeURIComponent(projectId)}`;
}

export async function getVoicePilotSettings(projectId: string): Promise<VoicePilotSettings> {
  const body = await get<VoicePilotSettings>(withProjectId(API_CONFIG.VOICE_PILOT_SETTINGS, projectId));
  return (
    (body as VoicePilotSettings | null | undefined) ?? {
      enabled: true,
      has_api_key: false,
      api_key_masked: null,
      voice_provider: 'elevenlabs',
      selected_voice_id: null,
      selected_voice_name: null,
      stt_locale: 'en-US',
      auto_listen_after_reply: false,
      preview_text: DEFAULT_VOICE_PREVIEW_TEXT,
    }
  );
}

export async function putVoicePilotSettings(
  projectId: string,
  payload: VoicePilotSettingsUpdate,
): Promise<VoicePilotSettings> {
  const body = await put<VoicePilotSettingsUpdate, VoicePilotSettings>(
    withProjectId(API_CONFIG.VOICE_PILOT_SETTINGS, projectId),
    payload,
  );
  return body as VoicePilotSettings;
}

export async function testVoicePilotApiKey(
  projectId: string,
  elevenlabs_api_key?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const body = await post<{ elevenlabs_api_key?: string | null }, { ok: boolean; message: string }>(
    withProjectId(API_CONFIG.VOICE_PILOT_SETTINGS_TEST, projectId),
    { elevenlabs_api_key },
  );
  return (body as { ok: boolean; message: string }) ?? { ok: false, message: 'Test failed' };
}

export async function listVoicePilotVoices(
  projectId: string,
  provider?: string | null,
): Promise<VoicePilotVoice[]> {
  let path = withProjectId(API_CONFIG.VOICE_PILOT_VOICES, projectId);
  if (provider) {
    path += `&provider=${encodeURIComponent(provider)}`;
  }
  const body = await get<VoicePilotVoice[]>(path);
  return Array.isArray(body) ? body : [];
}

export async function voicePilotTurn(
  projectId: string,
  text: string,
  options?: {
    sessionId?: string | null;
    chatHistory?: { role: 'user' | 'assistant'; content: string }[];
  },
): Promise<VoicePilotTurnResponse> {
  const body = await post<
    {
      text: string;
      session_id?: string | null;
      chat_history?: { role: string; content: string }[];
    },
    VoicePilotTurnResponse
  >(withProjectId(API_CONFIG.VOICE_PILOT_TURN, projectId), {
    text,
    session_id: options?.sessionId ?? null,
    chat_history: options?.chatHistory,
  });
  return (body as VoicePilotTurnResponse) ?? { answer: '' };
}

export type VoicePilotStreamHandlers = {
  onSentence?: (payload: { text: string; audio?: Blob }) => void;
  onPartial?: (answer: string) => void;
  onClearAudio?: () => void;
  onDone?: (answer: string) => void;
  onError?: (message: string) => void;
  /** Soft TTS failure — answer text continues; surface once. */
  onTtsWarning?: (message: string) => void;
};

function b64ToBlob(b64: string, mime = 'audio/mpeg'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function consumeTurnStreamResponse(
  response: Response,
  handlers: VoicePilotStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.ok) {
    let detail = 'Voice turn stream failed';
    try {
      const data = (await response.json()) as { detail?: string };
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (!response.body) {
    throw new Error('Voice turn stream returned no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuf = '';
  let finalAnswer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }

    sseBuf += decoder.decode(value, { stream: true });
    while (true) {
      const nl = sseBuf.indexOf('\n');
      if (nl < 0) break;
      const rawLine = sseBuf.slice(0, nl);
      sseBuf = sseBuf.slice(nl + 1);
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data:')) continue;
      const raw = line.slice('data:'.length).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const type = typeof parsed.type === 'string' ? parsed.type : '';

        if (type === 'sentence') {
          const sentenceText = typeof parsed.text === 'string' ? parsed.text : '';
          let audio: Blob | undefined;
          if (typeof parsed.audio_b64 === 'string' && parsed.audio_b64) {
            audio = b64ToBlob(parsed.audio_b64);
          }
          handlers.onSentence?.({ text: sentenceText, audio });
        } else if (type === 'partial') {
          const answer = typeof parsed.answer === 'string' ? parsed.answer : '';
          if (answer) handlers.onPartial?.(answer);
        } else if (type === 'clear_audio') {
          handlers.onClearAudio?.();
        } else if (type === 'tts_warning') {
          const message =
            typeof parsed.message === 'string' ? parsed.message : 'Speech synthesis failed';
          handlers.onTtsWarning?.(message);
        } else if (type === 'done') {
          finalAnswer = typeof parsed.answer === 'string' ? parsed.answer : '';
          handlers.onDone?.(finalAnswer);
        } else if (type === 'error') {
          const message =
            typeof parsed.message === 'string' ? parsed.message : 'Voice turn stream error';
          handlers.onError?.(message);
          throw new Error(message);
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          /* skip malformed SSE line */
          continue;
        }
        throw err;
      }
    }
  }

  return finalAnswer;
}

/**
 * Consume POST /voice-pilot/turn/stream SSE events.
 */
export async function voicePilotTurnStream(
  projectId: string,
  text: string,
  handlers: VoicePilotStreamHandlers = {},
  signal?: AbortSignal,
  chatHistory?: { role: 'user' | 'assistant'; content: string }[],
  options?: { provider?: string | null; voiceId?: string | null },
): Promise<string> {
  const response = await fetchWithAuth(withProjectId(API_CONFIG.VOICE_PILOT_TURN_STREAM, projectId), {
    method: 'POST',
    body: JSON.stringify({
      text,
      session_id: null,
      chat_history: chatHistory ?? undefined,
      provider: options?.provider ?? null,
      voice_id: options?.voiceId ?? null,
    }),
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  return consumeTurnStreamResponse(response, handlers, signal);
}

async function fetchTtsAudio(
  path: string,
  projectId: string,
  text: string,
  voiceId?: string | null,
  provider?: string | null,
): Promise<Blob> {
  const response = await fetchWithAuth(withProjectId(path, projectId), {
    method: 'POST',
    body: JSON.stringify({
      text,
      voice_id: voiceId ?? null,
      provider: provider ?? null,
    }),
  });
  if (!response.ok) {
    let detail = 'Speech synthesis failed';
    try {
      const data = (await response.json()) as { detail?: string };
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return response.blob();
}

export async function previewVoicePilotTts(
  projectId: string,
  text: string,
  voiceId?: string | null,
  provider?: string | null,
): Promise<Blob> {
  return fetchTtsAudio(API_CONFIG.VOICE_PILOT_TTS_PREVIEW, projectId, text, voiceId, provider);
}

export async function speakVoicePilotTts(
  projectId: string,
  text: string,
  voiceId?: string | null,
  provider?: string | null,
): Promise<Blob> {
  return fetchTtsAudio(API_CONFIG.VOICE_PILOT_TTS_SPEAK, projectId, text, voiceId, provider);
}

export async function playAudioBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (typeof Audio === 'undefined') {
    throw new Error('Audio playback is not available on this device');
  }
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    if (signal) {
      const onAbort = () => {
        audio.pause();
        audio.src = '';
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed'));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type VoicePilotWidgetBootstrap = {
  enabled: boolean;
  provider: 'elevenlabs' | 'custom';
  voice_id: string | null;
  voice_name: string | null;
  preview_text: string;
  stt_locale: string;
  has_api_key: boolean;
};

function isVoicePilotWidgetBootstrap(body: unknown): body is VoicePilotWidgetBootstrap {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { enabled?: unknown }).enabled === 'boolean'
  );
}

export async function getChatbotVoicePilotBootstrap(
  projectId: string,
): Promise<VoicePilotWidgetBootstrap> {
  const body = await get<VoicePilotWidgetBootstrap>(
    withProjectId(API_CONFIG.VOICE_PILOT_WIDGET_BOOTSTRAP, projectId),
  );
  if (isVoicePilotWidgetBootstrap(body)) return body;
  return {
    enabled: false,
    provider: 'elevenlabs',
    voice_id: null,
    voice_name: null,
    preview_text: DEFAULT_VOICE_PREVIEW_TEXT,
    stt_locale: 'en-US',
    has_api_key: false,
  };
}

export async function chatbotVoicePilotTts(projectId: string, text: string): Promise<Blob> {
  const response = await fetchWithAuth(withProjectId(API_CONFIG.VOICE_PILOT_WIDGET_TTS, projectId), {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let detail = 'Speech synthesis failed';
    try {
      const data = (await response.json()) as { detail?: string };
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return response.blob();
}

export async function chatbotVoicePilotTurnStream(
  projectId: string,
  text: string,
  handlers: VoicePilotStreamHandlers = {},
  signal?: AbortSignal,
  chatHistory?: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const response = await fetchWithAuth(
    withProjectId(API_CONFIG.VOICE_PILOT_WIDGET_TURN_STREAM, projectId),
    {
      method: 'POST',
      body: JSON.stringify({
        text,
        session_id: null,
        chat_history: chatHistory ?? undefined,
      }),
      headers: { Accept: 'text/event-stream' },
      signal,
    },
  );
  return consumeTurnStreamResponse(response, handlers, signal);
}
