import { Platform } from 'react-native';

import { storage } from '@/services/storage/storage';
import { normalizeEmbedSiteHost } from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';

const memoryStore = new Map<string, string>();

export const DASHBOARD_CHAT_SESSION_PREFIX = 'chat_dashboard_session_';
/** Third-party embed session key (matches legacy EmbeddableWidget prefix). */
export const EMBED_CHAT_SESSION_PREFIX = 'chat_widget_session_';

export function getDashboardChatSessionKey(projectId: string): string {
  return `${DASHBOARD_CHAT_SESSION_PREFIX}${projectId}`;
}

/**
 * Active embed session key.
 * When `siteHost` is provided, scopes by parent website so Site A / Site B stay separate.
 * Omit `siteHost` only for legacy/unscoped dashboard↔embed pop-out parity on the admin origin.
 */
export function getEmbedChatSessionKey(
  projectId: string,
  siteHost?: string | null,
): string {
  const id = String(projectId || '').trim();
  if (siteHost != null && String(siteHost).trim() !== '') {
    const host = normalizeEmbedSiteHost(siteHost);
    return `${EMBED_CHAT_SESSION_PREFIX}${id}_${host}`;
  }
  return `${EMBED_CHAT_SESSION_PREFIX}${id}`;
}

/**
 * Persist the active chat session under both dashboard and unscoped embed keys so
 * Pop out handoff stays aligned on the same origin (dashboard mode).
 */
export function writeSharedChatSessionId(projectId: string, sessionId: string): void {
  const id = String(projectId || '').trim();
  const session = String(sessionId || '').trim();
  if (!id || !session) return;
  writeStoredSessionId(getDashboardChatSessionKey(id), session);
  writeStoredSessionId(getEmbedChatSessionKey(id), session);
}

/** Persist active session for a third-party embed site (site-scoped only). */
export function writeEmbedChatSessionId(
  projectId: string,
  siteHost: string,
  sessionId: string,
): void {
  const id = String(projectId || '').trim();
  const session = String(sessionId || '').trim();
  if (!id || !session) return;
  writeStoredSessionId(getEmbedChatSessionKey(id, siteHost), session);
}


/** Sync read from in-memory cache (after hydrate / write). */
export function readStoredSessionId(key: string): string | undefined {
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

/**
 * Load persisted session into memory.
 * Web: localStorage (reference key). Native: SecureStore via shared storage helper.
 */
export async function hydrateStoredSessionId(key: string): Promise<string | undefined> {
  if (Platform.OS === 'web') {
    return readStoredSessionId(key);
  }

  try {
    const stored = await storage.getItem(key);
    const trimmed = stored?.trim() || undefined;
    if (trimmed) {
      memoryStore.set(key, trimmed);
      return trimmed;
    }
    memoryStore.delete(key);
    return undefined;
  } catch {
    return memoryStore.get(key);
  }
}

export function writeStoredSessionId(key: string, sessionId: string): void {
  memoryStore.set(key, sessionId);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, sessionId);
    } catch {
      // ignore storage failures
    }
    return;
  }
  void storage.setItem(key, sessionId).catch(() => {
    // ignore SecureStore failures
  });
}

export function clearStoredSessionId(key: string): void {
  memoryStore.delete(key);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  void storage.removeItem(key).catch(() => {
    // ignore
  });
}

export function generateChatSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Prefer an explicit viewing/live session id (e.g. Recent row click) over the
 * persisted live id from storage. Omitting explicit keeps hydrate behavior.
 */
export function resolveSessionIdForHistoryLoad(input: {
  explicit?: string | null;
  stored?: string | null;
}): string | undefined {
  const explicit = String(input.explicit || '').trim();
  if (explicit) return explicit;
  const stored = String(input.stored || '').trim();
  return stored || undefined;
}
