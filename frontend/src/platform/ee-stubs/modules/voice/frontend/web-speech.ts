/**
 * CE stub — real TTS locale/voice helpers live in RAGSUITE_EE `modules/voice`.
 */
export type SpeechVoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
};

export function toSpeechLocale(language?: string | null): string {
  const raw = (language || 'en').trim().toLowerCase();
  if (raw.startsWith('hi')) return 'hi-IN';
  if (raw === 'en-gb') return 'en-GB';
  return 'en-US';
}

export function selectProfessionalVoice(
  _lang: string,
  _voices: SpeechVoiceLike[],
): SpeechVoiceLike | null {
  return null;
}

export function buildSpeechSegments(text: string): { text: string; pauseAfterMs: number }[] {
  const trimmed = String(text || '').trim();
  return trimmed ? [{ text: trimmed, pauseAfterMs: 0 }] : [];
}

/** CE stub — language-aware duration lives in EE; keep English baseline. */
export function estimateUtteranceDurationMs(
  text: string,
  rate: number,
  _language?: string | null,
): number {
  const words = (text.match(/\S+/g) || []).length;
  if (words <= 0) return 800;
  const wpm = 160 * Math.max(0.5, rate || 1);
  return Math.max(800, Math.round((words / wpm) * 60_000));
}
