import { getEmbedWidgetAuthHeaders } from '@/network/embed-widget-auth';
import { getAccessToken } from '@/network/auth-session';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';

export type WidgetSpeechSurface = 'chat' | 'search';

export type WidgetSpeechConfig = {
  asr: boolean;
  tts: boolean;
};

const NATIVE_CONFIG: WidgetSpeechConfig = { asr: false, tts: false };
const inflight = new Map<WidgetSpeechSurface, Promise<WidgetSpeechConfig>>();
const cache = new Map<WidgetSpeechSurface, WidgetSpeechConfig>();

function unwrapData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const data = 'data' in body ? (body as { data?: unknown }).data : body;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

function enabledFrom(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as { enabled?: unknown }).enabled === true;
}

function speechHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
    ...getEmbedWidgetAuthHeaders(),
  };
  if (json) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function speechFetch(path: string, init: RequestInit, json = true): Promise<Response> {
  return fetch(buildApiUrl(path), {
    ...init,
    headers: speechHeaders(json),
    credentials: 'include',
  });
}

export function resetWidgetSpeechConfigCache(): void {
  inflight.clear();
  cache.clear();
}

export async function fetchWidgetSpeechConfig(
  surface: WidgetSpeechSurface,
): Promise<WidgetSpeechConfig> {
  const hit = cache.get(surface);
  if (hit) return hit;
  const pending = inflight.get(surface);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await speechFetch(
        `${API_CONFIG.WIDGET_SPEECH_CONFIG}?surface=${encodeURIComponent(surface)}`,
        { method: 'GET' },
      );
      if (!response.ok) return NATIVE_CONFIG;
      const body = unwrapData(await response.json());
      const next: WidgetSpeechConfig = {
        asr: enabledFrom(body?.asr),
        tts: enabledFrom(body?.tts),
      };
      cache.set(surface, next);
      return next;
    } catch {
      return NATIVE_CONFIG;
    } finally {
      inflight.delete(surface);
    }
  })();
  inflight.set(surface, request);
  return request;
}

export async function fetchWidgetTtsAudio(
  text: string,
  surface: WidgetSpeechSurface,
): Promise<Blob | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const response = await speechFetch(API_CONFIG.WIDGET_SPEECH_TTS, {
      method: 'POST',
      body: JSON.stringify({ text: trimmed.slice(0, 4096), surface }),
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export async function transcribeWidgetAudio(
  audio: Blob,
  surface: WidgetSpeechSurface,
  filename = 'speech.webm',
): Promise<string | null> {
  if (!audio.size) return null;
  const form = new FormData();
  form.append('surface', surface);
  form.append('file', audio, filename);
  try {
    const response = await speechFetch(
      API_CONFIG.WIDGET_SPEECH_STT,
      { method: 'POST', body: form },
      false,
    );
    if (!response.ok) return null;
    const body = unwrapData(await response.json());
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    return text || null;
  } catch {
    return null;
  }
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ctor = (window as Window & { MediaRecorder?: unknown }).MediaRecorder;
  const media = navigator.mediaDevices;
  return Boolean(
    window.isSecureContext && media && typeof media.getUserMedia === 'function' && typeof ctor === 'function',
  );
}
