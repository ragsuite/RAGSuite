/**
 * Slider ranges for widget retrieval settings. They mirror what the backend
 * actually applies at query time (see backend `routes/rag.py` chat clamps and
 * `services/search_run_context.py` search token caps), so the value shown is the
 * value used.
 */
export type SliderRange = { min: number; max: number; step: number };

export const CHAT_RETRIEVAL_LIMITS = {
  topK: { min: 3, max: 20, step: 1 },
  similarityThreshold: { min: 0.2, max: 0.45, step: 0.05 },
  maxTokens: { min: 500, max: 3000, step: 50 },
} as const satisfies Record<string, SliderRange>;

/** Used by the chat backend when no positive max tokens value is saved. */
export const CHAT_DEFAULT_MAX_TOKENS = 800;

export type SearchResponseType = 'long' | 'short';

export const SEARCH_RETRIEVAL_LIMITS = {
  topK: { min: 1, max: 10, step: 1 },
  similarityThreshold: { min: 0.1, max: 1, step: 0.05 },
  maxTokens: {
    long: { min: 400, max: 3000, step: 50 },
    short: { min: 200, max: 500, step: 50 },
  },
} as const;

/** Search backend defaults when no positive max tokens value is saved. */
export const SEARCH_DEFAULT_MAX_TOKENS: Record<SearchResponseType, number> = { long: 1000, short: 500 };

export function clampToRange(value: number, range: SliderRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

export function effectiveChatMaxTokens(saved: number | null | undefined): number {
  const value = saved && saved > 0 ? saved : CHAT_DEFAULT_MAX_TOKENS;
  return clampToRange(value, CHAT_RETRIEVAL_LIMITS.maxTokens);
}

export function effectiveSearchMaxTokens(saved: number | null | undefined, responseType: SearchResponseType): number {
  const value = saved && saved > 0 ? saved : SEARCH_DEFAULT_MAX_TOKENS[responseType];
  return clampToRange(value, SEARCH_RETRIEVAL_LIMITS.maxTokens[responseType]);
}
