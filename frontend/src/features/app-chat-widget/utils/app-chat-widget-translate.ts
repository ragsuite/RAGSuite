/** Max messages per translate API call — keeps LLM JSON reliable under backend max of 40. */
export const TRANSLATE_BATCH_SIZE = 8;

export type TranslateMessagePayload = {
  id: string;
  role?: string;
  content: string;
};

/** Split messages into fixed-size batches (preserves order). */
export function chunkTranslateMessages<T>(
  messages: T[],
  batchSize: number = TRANSLATE_BATCH_SIZE,
): T[][] {
  const size = Math.max(1, Math.floor(batchSize) || TRANSLATE_BATCH_SIZE);
  if (messages.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    batches.push(messages.slice(i, i + size));
  }
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
