/**
 * Parent → search embed focus contract (CEO widget handoff §5.3).
 * Accepts either CEO shorthand or sourced host messages; parent-only (checked by caller).
 */
export function isSearchEmbedFocusMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  if (msg.type === 'ragsuite:focus') return true;
  return msg.source === 'ragsuite-search-host' && msg.type === 'focus';
}
