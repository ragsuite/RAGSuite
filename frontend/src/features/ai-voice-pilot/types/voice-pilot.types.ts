export type VoicePilotPrimaryTab = 'pilot' | 'voices' | 'settings';
export type VoicePilotSettingsSection = 'provider' | 'experience' | 'orbLab';
export type VoicePilotProvider = 'elevenlabs' | 'custom';

export type VoicePilotSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

/** Per-voice ElevenLabs voice_settings (API field names). */
export type VoicePilotVoiceConfig = {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
};

/** Per-voice Custom TTS settings. */
export type VoicePilotCustomVoiceConfig = {
  rate: number;
  pitch: number;
  volume: number;
};

export const VOICE_CONFIG_DEFAULTS: VoicePilotVoiceConfig = {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
  use_speaker_boost: true,
};

export const CUSTOM_VOICE_CONFIG_DEFAULTS: VoicePilotCustomVoiceConfig = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/** Default Type-to-test / opening greeting text (per provider until user edits). */
export const DEFAULT_VOICE_PREVIEW_TEXT = 'Hello from AI Voice Pilot, how may I help you!!';

export type VoicePilotSettings = {
  enabled: boolean;
  has_api_key: boolean;
  api_key_masked: string | null;
  voice_provider?: VoicePilotProvider;
  selected_voice_id: string | null;
  selected_voice_name: string | null;
  stt_locale: string;
  auto_listen_after_reply: boolean;
  preview_text?: string;
  voice_configurations?: Record<
    string,
    VoicePilotVoiceConfig | VoicePilotCustomVoiceConfig
  >;
};

export type VoicePilotSettingsUpdate = {
  elevenlabs_api_key?: string | null;
  voice_provider?: VoicePilotProvider;
  selected_voice_id?: string | null;
  selected_voice_name?: string | null;
  stt_locale?: string;
  auto_listen_after_reply?: boolean;
  enabled?: boolean;
  preview_text?: string | null;
  /** Merge map; null value clears that voice back to defaults. */
  voice_configurations?: Record<
    string,
    VoicePilotVoiceConfig | VoicePilotCustomVoiceConfig | null
  >;
};

export type VoicePilotVoice = {
  voice_id: string;
  name: string;
  preview_url?: string | null;
  labels?: Record<string, string> | null;
  provider?: VoicePilotProvider | string | null;
  language?: string | null;
  language_code?: string | null;
  gender?: string | null;
  description?: string | null;
  age?: string | null;
  tags?: string[] | null;
};

export type VoicePilotTurnResponse = {
  answer: string;
  session_id?: string | null;
};

export function normalizeVoiceConfig(
  partial?: Partial<VoicePilotVoiceConfig> | null,
): VoicePilotVoiceConfig {
  const src = partial ?? {};
  const clamp01 = (n: number, fallback: number) => {
    if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  };
  const clampSpeed = (n: number) => {
    if (typeof n !== 'number' || Number.isNaN(n)) return VOICE_CONFIG_DEFAULTS.speed;
    return Math.min(1.2, Math.max(0.7, n));
  };
  return {
    stability: clamp01(src.stability as number, VOICE_CONFIG_DEFAULTS.stability),
    similarity_boost: clamp01(
      src.similarity_boost as number,
      VOICE_CONFIG_DEFAULTS.similarity_boost,
    ),
    style: clamp01(src.style as number, VOICE_CONFIG_DEFAULTS.style),
    speed: clampSpeed(src.speed as number),
    use_speaker_boost:
      typeof src.use_speaker_boost === 'boolean'
        ? src.use_speaker_boost
        : VOICE_CONFIG_DEFAULTS.use_speaker_boost,
  };
}

export function normalizeCustomVoiceConfig(
  partial?: Partial<VoicePilotCustomVoiceConfig> | null,
): VoicePilotCustomVoiceConfig {
  const src = partial ?? {};
  const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
    if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    rate: clamp(src.rate, 0.5, 2.0, CUSTOM_VOICE_CONFIG_DEFAULTS.rate),
    pitch: clamp(src.pitch, 0.5, 2.0, CUSTOM_VOICE_CONFIG_DEFAULTS.pitch),
    volume: clamp(src.volume, 0.0, 1.0, CUSTOM_VOICE_CONFIG_DEFAULTS.volume),
  };
}

export function voiceConfigsEqual(a: VoicePilotVoiceConfig, b: VoicePilotVoiceConfig): boolean {
  return (
    Math.abs(a.stability - b.stability) < 0.001 &&
    Math.abs(a.similarity_boost - b.similarity_boost) < 0.001 &&
    Math.abs(a.style - b.style) < 0.001 &&
    Math.abs(a.speed - b.speed) < 0.001 &&
    a.use_speaker_boost === b.use_speaker_boost
  );
}

export function customVoiceConfigsEqual(
  a: VoicePilotCustomVoiceConfig,
  b: VoicePilotCustomVoiceConfig,
): boolean {
  return (
    Math.abs(a.rate - b.rate) < 0.001 &&
    Math.abs(a.pitch - b.pitch) < 0.001 &&
    Math.abs(a.volume - b.volume) < 0.001
  );
}

export function filterCustomVoices(
  voices: VoicePilotVoice[],
  opts: { search?: string; language?: string; gender?: string },
): VoicePilotVoice[] {
  const q = (opts.search || '').trim().toLowerCase();
  const lang = (opts.language || '').trim().toLowerCase();
  const gen = (opts.gender || '').trim().toLowerCase();
  return voices.filter((v) => {
    if (q) {
      const hay = `${v.name} ${v.description || ''} ${v.language || ''} ${v.labels?.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (lang && lang !== 'all' && lang !== 'all languages') {
      const vl = (v.language || v.labels?.language || '').toLowerCase();
      const vc = (v.language_code || v.labels?.language_code || '').toLowerCase();
      if (!vl.includes(lang) && !vc.includes(lang) && vl !== lang) return false;
    }
    if (gen && gen !== 'all' && gen !== 'all genders') {
      const vg = (v.gender || v.labels?.gender || 'neutral').toLowerCase();
      if (vg !== gen) return false;
    }
    return true;
  });
}

/** Prefer English (US) as the default Custom carousel voice when nothing is selected. */
export function findDefaultCustomVoiceIndex(voices: VoicePilotVoice[]): number {
  if (!voices.length) return 0;
  const languageOf = (v: VoicePilotVoice) =>
    (v.language || v.labels?.language || '').toLowerCase();
  const usIdx = voices.findIndex((v) => {
    const lang = languageOf(v);
    return (
      lang.includes('english') &&
      (lang.includes('united states') || lang.includes('(us)') || lang.endsWith(' us'))
    );
  });
  if (usIdx >= 0) return usIdx;
  const enIdx = voices.findIndex((v) => languageOf(v).includes('english'));
  return enIdx >= 0 ? enIdx : 0;
}
