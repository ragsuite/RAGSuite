import { Platform } from 'react-native';

import { storage } from '@/services/storage/storage';
import { normalizeEmbedSiteHost } from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';
import { stripMarkdownToPlainText } from '@/features/chat-history/utils/strip-markdown-to-plain-text';

export const DASHBOARD_CHAT_SESSION_INDEX_PREFIX = 'chat_dashboard_session_index_';
export const EMBED_CHAT_SESSION_INDEX_PREFIX = 'chat_widget_session_index_';

export const SESSION_INDEX_CAP = 30;

export type ChatSessionIndexEntry = {
  sessionId: string;
  preview: string;
  updatedAt: string;
};

const memoryIndexStore = new Map<string, ChatSessionIndexEntry[]>();

export function getDashboardChatSessionIndexKey(projectId: string): string {
  return `${DASHBOARD_CHAT_SESSION_INDEX_PREFIX}${projectId}`;
}

/**
 * Embed Recent index key.
 * Pass `siteHost` to isolate Site A vs Site B for the same project.
 * Omit `siteHost` only for legacy unscoped keys (not written by embed mode anymore).
 */
export function getEmbedChatSessionIndexKey(
  projectId: string,
  siteHost?: string | null,
): string {
  const id = String(projectId || '').trim();
  if (siteHost != null && String(siteHost).trim() !== '') {
    const host = normalizeEmbedSiteHost(siteHost);
    return `${EMBED_CHAT_SESSION_INDEX_PREFIX}${id}_${host}`;
  }
  return `${EMBED_CHAT_SESSION_INDEX_PREFIX}${id}`;
}

function normalizeEntry(raw: unknown): ChatSessionIndexEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
  const preview = typeof record.preview === 'string' ? record.preview.trim() : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt.trim() : '';
  if (!sessionId || !preview || !updatedAt) return null;
  return { sessionId, preview, updatedAt };
}

function sortNewestFirst(entries: ChatSessionIndexEntry[]): ChatSessionIndexEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt) || 0;
    const bTime = Date.parse(b.updatedAt) || 0;
    return bTime - aTime;
  });
}

function capEntries(entries: ChatSessionIndexEntry[]): ChatSessionIndexEntry[] {
  return sortNewestFirst(entries).slice(0, SESSION_INDEX_CAP);
}

function parseIndexJson(raw: string | null | undefined): ChatSessionIndexEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: ChatSessionIndexEntry[] = [];
    for (const item of parsed) {
      const entry = normalizeEntry(item);
      if (entry) entries.push(entry);
    }
    return capEntries(entries);
  } catch {
    return [];
  }
}

function persistIndex(key: string, entries: ChatSessionIndexEntry[]): void {
  const capped = capEntries(entries);
  memoryIndexStore.set(key, capped);
  const payload = JSON.stringify(capped);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, payload);
    } catch {
      // ignore storage failures
    }
    return;
  }
  void storage.setItem(key, payload).catch(() => {
    // ignore SecureStore failures
  });
}

/** Sync read from memory / localStorage (after hydrate / write). */
export function readSessionIndex(key: string): ChatSessionIndexEntry[] {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(key);
      const entries = parseIndexJson(stored);
      memoryIndexStore.set(key, entries);
      return entries;
    } catch {
      return memoryIndexStore.get(key) ?? [];
    }
  }
  return memoryIndexStore.get(key) ?? [];
}

export async function hydrateSessionIndex(key: string): Promise<ChatSessionIndexEntry[]> {
  if (Platform.OS === 'web') {
    return readSessionIndex(key);
  }

  try {
    const stored = await storage.getItem(key);
    const entries = parseIndexJson(stored);
    memoryIndexStore.set(key, entries);
    return entries;
  } catch {
    return memoryIndexStore.get(key) ?? [];
  }
}

export function writeSessionIndex(key: string, entries: ChatSessionIndexEntry[]): void {
  persistIndex(key, entries);
}

export function upsertSessionIndexEntry(
  key: string,
  entry: ChatSessionIndexEntry,
): ChatSessionIndexEntry[] {
  const sessionId = entry.sessionId.trim();
  const rawPreview = entry.preview.trim();
  const preview = stripMarkdownToPlainText(rawPreview) || rawPreview;
  const updatedAt = entry.updatedAt.trim() || new Date().toISOString();
  if (!sessionId || !preview) {
    return readSessionIndex(key);
  }

  const next = readSessionIndex(key).filter((item) => item.sessionId !== sessionId);
  next.unshift({ sessionId, preview, updatedAt });
  persistIndex(key, next);
  return readSessionIndex(key);
}

export function removeSessionIndexEntry(key: string, sessionId: string): ChatSessionIndexEntry[] {
  const id = sessionId.trim();
  if (!id) return readSessionIndex(key);
  const next = readSessionIndex(key).filter((item) => item.sessionId !== id);
  persistIndex(key, next);
  return next;
}

/** Write the same index under dashboard + unscoped embed keys (dashboard pop-out parity). */
export function writeSharedSessionIndex(
  projectId: string,
  entries: ChatSessionIndexEntry[],
): void {
  const id = String(projectId || '').trim();
  if (!id) return;
  const capped = capEntries(entries);
  persistIndex(getDashboardChatSessionIndexKey(id), capped);
  persistIndex(getEmbedChatSessionIndexKey(id), capped);
}

/** Dashboard Recent index only (project-level; does not write site-scoped embed keys). */
export function upsertSharedSessionIndexEntry(
  projectId: string,
  entry: ChatSessionIndexEntry,
): ChatSessionIndexEntry[] {
  const id = String(projectId || '').trim();
  if (!id) return [];
  return upsertSessionIndexEntry(getDashboardChatSessionIndexKey(id), entry);
}

export function removeSharedSessionIndexEntry(
  projectId: string,
  sessionId: string,
): ChatSessionIndexEntry[] {
  const id = String(projectId || '').trim();
  if (!id) return [];
  return removeSessionIndexEntry(getDashboardChatSessionIndexKey(id), sessionId);
}

/** Embed Recent index scoped to a parent website host. */
export function upsertEmbedSessionIndexEntry(
  projectId: string,
  siteHost: string,
  entry: ChatSessionIndexEntry,
): ChatSessionIndexEntry[] {
  const id = String(projectId || '').trim();
  if (!id) return [];
  return upsertSessionIndexEntry(getEmbedChatSessionIndexKey(id, siteHost), entry);
}

export function removeEmbedSessionIndexEntry(
  projectId: string,
  siteHost: string,
  sessionId: string,
): ChatSessionIndexEntry[] {
  const id = String(projectId || '').trim();
  if (!id) return [];
  return removeSessionIndexEntry(getEmbedChatSessionIndexKey(id, siteHost), sessionId);
}

export function previewFromMessages(
  messages: Array<{ role: string; content: string; createdAt?: string }>,
  isWelcome: (message: { role: string; content: string; createdAt?: string }) => boolean,
): { preview: string; updatedAt: string } | null {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && !isWelcome(m));
  const source = lastUser ?? lastAssistant;
  if (!source) return null;
  const rawPreview = (source.content || '').trim();
  if (!rawPreview) return null;
  const preview = stripMarkdownToPlainText(rawPreview) || rawPreview;
  return {
    preview,
    updatedAt: source.createdAt?.trim() || new Date().toISOString(),
  };
}
