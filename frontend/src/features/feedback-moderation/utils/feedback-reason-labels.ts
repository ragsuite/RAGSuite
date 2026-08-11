const REASON_LABEL_OVERRIDES: Record<string, string> = {
  low_quality: 'Low quality',
  missing_sources: 'Missing sources',
  helpful: 'Helpful',
  fast_response: 'Fast response',
  inaccurate: 'Inaccurate',
  incomplete: 'Incomplete',
  slow_response: 'Slow response',
  wrong_answer: 'Wrong answer',
};

/** Turn API reason keys like `low_quality` into reference labels like `Low quality`. */
export function formatFeedbackReasonKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.toLowerCase();
  if (REASON_LABEL_OVERRIDES[normalized]) return REASON_LABEL_OVERRIDES[normalized];
  if (trimmed.includes(' ') && !trimmed.includes('_')) return trimmed;
  return trimmed
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatNegativeReasonPill(key: string, count: number): string {
  return `${formatFeedbackReasonKey(key)} (${count})`;
}

export function formatFeedbackReasonTags(tags: string[]): string[] {
  return tags.map(formatFeedbackReasonKey);
}
