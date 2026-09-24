/** Max messages per translate API call — keeps LLM JSON reliable under backend max of 40. */
export const TRANSLATE_BATCH_SIZE = 8;
/** Keep one request from carrying several very long answers at once. */
export const TRANSLATE_BATCH_MAX_CHARS = 24000;

export type TranslateMessagePayload = {
  id: string;
  role?: string;
  content: string;
};

/** Split messages into batches (preserves order). A very long answer goes in its own request. */
export function chunkTranslateMessages<T extends { content?: string }>(
  messages: T[],
  batchSize: number = TRANSLATE_BATCH_SIZE,
  maxChars: number = TRANSLATE_BATCH_MAX_CHARS,
): T[][] {
  const size = Math.max(1, Math.floor(batchSize) || TRANSLATE_BATCH_SIZE);
  const charBudget = Math.max(1, Math.floor(maxChars) || TRANSLATE_BATCH_MAX_CHARS);
  if (messages.length === 0) return [];
  const batches: T[][] = [];
  let batch: T[] = [];
  let chars = 0;
  for (const message of messages) {
    const length = (message.content || '').length;
    const overBudget = batch.length > 0 && chars + length > charBudget;
    if (batch.length >= size || overBudget) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(message);
    chars += length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** True when every expected id has a non-empty translation string. */
export function translationsCoverBatchIds(
  translations: Record<string, string> | null | undefined,
  expectedIds: string[],
): boolean {
  if (!translations || expectedIds.length === 0) return false;
  return expectedIds.every((id) => {
    const value = translations[id];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/** Merge batch maps left-to-right (later batches overwrite same ids). */
export function mergeTranslationMaps(
  maps: Array<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const map of maps) {
    for (const [id, text] of Object.entries(map)) {
      if (typeof text === 'string' && text.trim()) {
        out[id] = text;
      }
    }
  }
  return out;
}

/**
 * User bubbles render plain Text (no Markdown). Strip markers so leftover
 * `**` / `#` from the LLM never show literally. Assistant keeps Markdown.
 */
export function sanitizeTranslatedOverlay(
  role: string | undefined,
  text: string,
  stripMarkdown: (markdown: string) => string,
): string {
  const raw = (text || '').trim();
  if (!raw) return '';
  const normalizedRole = (role || '').trim().toLowerCase();
  if (normalizedRole !== 'user') return raw;
  return stripMarkdown(raw).trim() || raw;
}

/** Apply per-role sanitization using the batch's role map. */
export function sanitizeTranslationBatch(
  translations: Record<string, string>,
  batch: Array<{ id: string; role?: string }>,
  stripMarkdown: (markdown: string) => string,
): Record<string, string> {
  const roleById = new Map(batch.map((m) => [m.id, m.role]));
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(translations)) {
    out[id] = sanitizeTranslatedOverlay(roleById.get(id), text, stripMarkdown);
  }
  return out;
}
