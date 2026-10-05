import type { AppLocaleCode } from '@/i18n/constants';
import { AVAILABLE_LOCALES } from '@/i18n/constants';
import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';

export type VoiceLanguageFilter = 'all' | AppLocaleCode;

/** ElevenLabs labels.language / labels.accent matchers per app locale. */
const LOCALE_MATCHERS: Record<
  AppLocaleCode,
  { include: string[]; exclude?: string[] }
> = {
  en: {
    include: ['american', 'us', 'united states', 'en-us', 'en_us', 'english'],
    exclude: ['british', 'uk', 'en-gb', 'en_gb', 'australian', 'irish', 'scottish'],
  },
  'en-gb': {
    include: ['british', 'uk', 'united kingdom', 'en-gb', 'en_gb'],
  },
  es: { include: ['spanish', 'español', 'espanol', 'castilian', 'mexican', 'es'] },
  fr: { include: ['french', 'français', 'francais', 'fr'] },
  de: { include: ['german', 'deutsch', 'de'] },
  ar: { include: ['arabic', 'العربية', 'ar', 'saudi', 'egyptian'] },
  pt: { include: ['portuguese', 'português', 'portugues', 'brazilian', 'brasil', 'brazil', 'pt'] },
  zh: { include: ['chinese', 'mandarin', '中文', 'zh', 'cantonese'] },
};

function norm(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

export function isWorkingVoice(voice: VoicePilotVoice): boolean {
  return Boolean(voice.preview_url && String(voice.preview_url).trim());
}

export function filterWorkingVoices(voices: VoicePilotVoice[]): VoicePilotVoice[] {
  return voices.filter(isWorkingVoice);
}

function voiceLabelBlob(voice: VoicePilotVoice): string {
  const labels = voice.labels ?? {};
  return [
    labels.language,
    labels.accent,
    labels.descriptive,
    labels.use_case,
    voice.name,
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

export function voiceMatchesLocale(voice: VoicePilotVoice, locale: AppLocaleCode): boolean {
  const blob = voiceLabelBlob(voice);
  if (!blob) return false;
  const rule = LOCALE_MATCHERS[locale];
  if (!rule) return false;
  if (rule.exclude?.some((token) => blob.includes(token))) return false;
  return rule.include.some((token) => blob.includes(token));
}

export function filterVoicesByLanguage(
  voices: VoicePilotVoice[],
  filter: VoiceLanguageFilter,
): VoicePilotVoice[] {
  if (filter === 'all') return voices;
  return voices.filter((voice) => voiceMatchesLocale(voice, filter));
}

/**
 * Order working voices for the Voices carousel: locale-matched first (all matches
 * across app locales), then any remaining working voices. No per-locale cap —
 * the full ElevenLabs working catalog is shown.
 */
export function seedTrendingVoices(working: VoicePilotVoice[]): VoicePilotVoice[] {
  if (!working.length) return [];

  const used = new Set<string>();
  const out: VoicePilotVoice[] = [];

  for (const locale of AVAILABLE_LOCALES) {
    for (const voice of working) {
      if (used.has(voice.voice_id)) continue;
      if (!voiceMatchesLocale(voice, locale.code)) continue;
      used.add(voice.voice_id);
      out.push(voice);
    }
  }

  for (const voice of working) {
    if (used.has(voice.voice_id)) continue;
    out.push(voice);
  }

  return out;
}

export function voiceAccentLabel(voice: VoicePilotVoice): string {
  const labels = voice.labels ?? {};
  return labels.accent || labels.language || labels.use_case || labels.descriptive || '';
}

export function voiceUseCaseLabel(voice: VoicePilotVoice): string {
  const labels = voice.labels ?? {};
  return labels.use_case || labels.descriptive || '';
}

/** Humanize ElevenLabs slug labels: `informative_educational` → `Informative educational`. */
export function formatVoiceLabel(raw: string): string {
  const spaced = String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Center carousel copy — same fallback chain as voice list rows. */
export function voiceCarouselDescription(voice: VoicePilotVoice): string {
  const raw = voice.description || voice.labels?.description || '';
  return String(raw).trim();
}

/** Side carousel column — short label (use case or truncated name). */
export function voiceCarouselNeighborTitle(voice: VoicePilotVoice, maxLen = 22): string {
  const useCase = formatVoiceLabel(voiceUseCaseLabel(voice));
  if (useCase) {
    if (useCase.length <= maxLen) return useCase;
    return `${useCase.slice(0, maxLen - 1)}…`;
  }
  const name = voice.name.trim();
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

/** Truncated name under the active orb (reference-style). */
export function voiceCarouselCenterOrbLabel(voice: VoicePilotVoice, maxLen = 18): string {
  const name = voice.name.trim();
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 3)}...`;
}

export function spherePaletteIndex(voiceId: string): number {
  let hash = 0;
  for (let i = 0; i < voiceId.length; i += 1) {
    hash = (hash * 31 + voiceId.charCodeAt(i)) >>> 0;
  }
  return hash % 6;
}
