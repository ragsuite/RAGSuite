/**
 * CE stub — real TTS locale/voice helpers live in RAGSUITE_EE `modules/voice`.
 */
export function toSpeechLocale(language?: string | null): string {
  const raw = (language || 'en').trim().toLowerCase();
  if (raw.startsWith('hi')) return 'hi-IN';
  if (raw === 'en-gb') return 'en-GB';
  return 'en-US';
}

export function selectProfessionalVoice(
  _lang: string,
  _voices: { name: string; lang: string }[],
): { name: string; lang: string } | null {
  return null;
}

export function buildSpeechSegments(text: string): { text: string; pauseAfterMs: number }[] {
  const trimmed = String(text || '').trim();
  return trimmed ? [{ text: trimmed, pauseAfterMs: 0 }] : [];
}
