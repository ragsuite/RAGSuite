type TranslateFn = (key: string) => string;

/** Known API reason codes → i18n key suffix under `feedbackModeration.reason.*`. */
const KNOWN_REASON_KEYS = new Set([
  'helpful',
  'accurate',
  'complete',
  'clear',
  'fast_response',
  'incorrect',
  'hallucinated',
  'missing_sources',
  'too_technical',
  'outdated_information',
  'low_quality',
  'poor_formatting',
  'slow_response',
  'accuracy',
  'helpfulness',
  'relevance',
  'completeness',
  'clarity',
  'speed',
  'other',
  'inaccurate',
  'incomplete',
  'wrong_answer',
]);

function titleCaseReason(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function feedbackReasonI18nKey(key: string): string {
  return `feedbackModeration.reason.${key.trim().toLowerCase()}`;
}

/** Turn API reason keys like `low_quality` into localized labels. */
export function formatFeedbackReasonKey(key: string, t?: TranslateFn): string {
  const trimmed = key.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(' ') && !trimmed.includes('_')) return trimmed;

  const normalized = trimmed.toLowerCase();
  const i18nKey = feedbackReasonI18nKey(normalized);
  if (t) {
    const translated = t(i18nKey);
    if (translated !== i18nKey) return translated;
  }
  if (KNOWN_REASON_KEYS.has(normalized) && !t) {
    // English fallbacks when called outside React (mapper / sort helpers).
    return titleCaseReason(normalized);
  }
  return titleCaseReason(normalized);
}

export function formatNegativeReasonPill(key: string, count: number, t?: TranslateFn): string {
  return `${formatFeedbackReasonKey(key, t)} (${count})`;
}

export function formatFeedbackReasonTags(tags: string[], t?: TranslateFn): string[] {
  return tags.map((tag) => formatFeedbackReasonKey(tag, t));
}
