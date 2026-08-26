/**
 * Parent → search embed focus contract (CEO widget handoff §5.3).
 * Accepts either CEO shorthand or sourced host messages; parent-only (checked by caller).
 * Embed acknowledges with `{ source: 'ragsuite-search-embed', type: 'focus-ack' }`.
 */
export function isSearchEmbedFocusMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  if (msg.type === 'ragsuite:focus') return true;
  return msg.source === 'ragsuite-search-host' && msg.type === 'focus';
}

export function isSearchEmbedFocusAckMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return msg.source === 'ragsuite-search-embed' && msg.type === 'focus-ack';
}
