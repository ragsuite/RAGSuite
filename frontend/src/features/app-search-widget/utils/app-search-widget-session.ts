import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();

/** Third-party embed session key (visitor search session). */
export const EMBED_SEARCH_SESSION_PREFIX = 'search_widget_session_';
export const EMBED_SEARCH_RECENT_PREFIX = 'search_widget_recent_';

export function getEmbedSearchSessionKey(projectId: string): string {
  return `${EMBED_SEARCH_SESSION_PREFIX}${projectId}`;
}

export function getEmbedSearchRecentKey(projectId: string): string {
  return `${EMBED_SEARCH_RECENT_PREFIX}${projectId}`;
}

function webGet(key: string): string | undefined {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(key);
      const trimmed = stored?.trim() || undefined;
      if (trimmed) memoryStore.set(key, trimmed);
      return trimmed;
    } catch {
      return memoryStore.get(key);
    }
  }
  return memoryStore.get(key);
}

function webSet(key: string, value: string): void {
  memoryStore.set(key, value);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}

export function readStoredSearchSessionId(key: string): string | undefined {
  return webGet(key);
}

export function writeStoredSearchSessionId(key: string, sessionId: string): void {
  webSet(key, sessionId);
}

export function generateSearchSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `search_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export type StoredRecentSearch = { text: string; at: string };

export function readStoredRecentSearches(key: string): StoredRecentSearch[] {
  const raw = webGet(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const text = typeof (row as { text?: unknown }).text === 'string' ? (row as { text: string }).text : '';
        const at = typeof (row as { at?: unknown }).at === 'string' ? (row as { at: string }).at : '';
        if (!text.trim()) return null;
        return { text: text.trim(), at: at || new Date().toISOString() };
      })
      .filter((row): row is StoredRecentSearch => row != null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function writeStoredRecentSearches(key: string, items: StoredRecentSearch[]): void {
  webSet(key, JSON.stringify(items.slice(0, 5)));
}

export function rememberRecentSearch(key: string, text: string): StoredRecentSearch[] {
  const trimmed = text.trim();
  if (!trimmed) return readStoredRecentSearches(key);
  const next: StoredRecentSearch[] = [
    { text: trimmed, at: new Date().toISOString() },
    ...readStoredRecentSearches(key).filter((row) => row.text.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 5);
  writeStoredRecentSearches(key, next);
  return next;
}
