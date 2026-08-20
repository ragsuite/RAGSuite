/**
 * Resolve the query for a search submit.
 * Pressable/TextInput may pass a non-string event as the first arg — ignore those.
 */
export function resolveSearchSubmitQuery(
  override: unknown,
  fallbackQuery: string,
): string {
  const raw = typeof override === 'string' ? override : fallbackQuery;
  return raw.trim();
}
