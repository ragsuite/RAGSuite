import { useEffect, useState } from 'react';

import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

export const WIDGET_CAPABILITY_VOICE_STT = 'voice.stt';
export const WIDGET_CAPABILITY_VOICE_TTS = 'voice.tts';

type WidgetCapabilitiesResponse = {
  capabilities?: unknown;
};

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
const listeners = new Set<() => void>();

export function parseWidgetCapabilitiesPayload(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const caps = (body as WidgetCapabilitiesResponse).capabilities;
  if (!Array.isArray(caps)) return [];
  return caps.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function resetWidgetCapabilitiesCache(): void {
  cache = null;
  inflight = null;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export async function fetchWidgetCapabilities(): Promise<string[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await get<WidgetCapabilitiesResponse>(API_CONFIG.WIDGET_CAPABILITIES, {
        skipAuth: true,
        skipReachability: true,
      });
      cache = parseWidgetCapabilitiesPayload(data);
    } catch {
      cache = [];
    } finally {
      inflight = null;
      notify();
    }
    return cache ?? [];
  })();
  return inflight;
}

export function useWidgetCapabilities(): {
  ready: boolean;
  hasStt: boolean;
  hasTts: boolean;
} {
  const [caps, setCaps] = useState<string[]>(cache ?? []);
  const [ready, setReady] = useState(cache !== null);

  useEffect(() => {
    const sync = () => {
      setCaps(cache ?? []);
      setReady(cache !== null);
    };
    listeners.add(sync);
    void fetchWidgetCapabilities().then(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return {
    ready,
    hasStt: caps.includes(WIDGET_CAPABILITY_VOICE_STT),
    hasTts: caps.includes(WIDGET_CAPABILITY_VOICE_TTS),
  };
}
