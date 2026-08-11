import { Platform } from 'react-native';

import { storage } from '@/services/storage/storage';

const memoryStore = new Map<string, string>();

export const DASHBOARD_CHAT_SESSION_PREFIX = 'chat_dashboard_session_';
/** Third-party embed session key (matches legacy EmbeddableWidget prefix). */
export const EMBED_CHAT_SESSION_PREFIX = 'chat_widget_session_';

export function getDashboardChatSessionKey(projectId: string): string {
  return `${DASHBOARD_CHAT_SESSION_PREFIX}${projectId}`;
}

export function getEmbedChatSessionKey(projectId: string): string {
  return `${EMBED_CHAT_SESSION_PREFIX}${projectId}`;
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
