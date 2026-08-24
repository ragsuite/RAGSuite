/** Matches `EMBED_CHAT_SESSION_PREFIX` in app-chat-widget-session (host first-party key). */
export const EMBED_CHAT_SESSION_STORAGE_PREFIX = 'chat_widget_session_';

/**
 * First-party host localStorage (customer site). Cross-origin iframe storage is
 * partitioned under Safari ITP / Chrome — pass this value as `sessionId` on the iframe URL.
 */
export function readHostChatSessionId(
  projectId: string,
  getItem?: (key: string) => string | null,
): string | undefined {
  const id = String(projectId || '').trim();
  if (!id) return undefined;
  try {
    const read =
      getItem ??
      ((key: string) =>
        typeof localStorage === 'undefined' ? null : localStorage.getItem(key));
    const value = read(`${EMBED_CHAT_SESSION_STORAGE_PREFIX}${id}`);
    const trimmed = String(value || '').trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

/** Attach host session to embed query params (no-op when empty). */
export function appendChatSessionQuery(
  params: URLSearchParams,
  sessionId: string | undefined,
): URLSearchParams {
  const trimmed = String(sessionId || '').trim();
  if (trimmed) params.set('sessionId', trimmed);
  return params;
}
