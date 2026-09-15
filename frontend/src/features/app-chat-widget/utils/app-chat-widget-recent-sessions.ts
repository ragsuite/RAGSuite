import type { ChatHistoryApiRow } from '@/features/chat-history/types/chat-history.types';
import type { ChatSessionIndexEntry } from '@/features/app-chat-widget/utils/app-chat-widget-session-index';
import { SESSION_INDEX_CAP } from '@/features/app-chat-widget/utils/app-chat-widget-session-index';
import { stripMarkdownToPlainText } from '@/features/chat-history/utils/strip-markdown-to-plain-text';

export type AppChatRecentSession = {
  sessionId: string;
  preview: string;
  updatedAt: string;
  endedAt?: string | null;
};

function toRecentPreview(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return stripMarkdownToPlainText(trimmed) || trimmed;
}

/** Group history rows into one Recent entry per session (newest activity first). */
export function groupHistoryRowsToRecentSessions(
  rows: ChatHistoryApiRow[],
  cap = SESSION_INDEX_CAP,
): AppChatRecentSession[] {
  const bySession = new Map<string, AppChatRecentSession>();

  for (const row of rows) {
    const sessionId = (row.session_id || '').trim();
    if (!sessionId) continue;

    const assistant = (row.assistant_response || '').trim();
    const user = (row.user_message || '').trim();
    const preview = toRecentPreview(assistant || user);
    if (!preview) continue;

    const updatedAt = (row.created_at || '').trim() || new Date(0).toISOString();
    const existing = bySession.get(sessionId);
    const existingTime = existing ? Date.parse(existing.updatedAt) || 0 : 0;
    const rowTime = Date.parse(updatedAt) || 0;
    if (!existing || rowTime >= existingTime) {
      bySession.set(sessionId, { sessionId, preview, updatedAt });
    }
  }

  return [...bySession.values()]
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, cap);
}

/** Merge local index with server-derived sessions; prefer newer updatedAt / non-empty preview. */
export function mergeRecentSessions(
  local: ChatSessionIndexEntry[],
  remote: AppChatRecentSession[],
  cap = SESSION_INDEX_CAP,
): AppChatRecentSession[] {
  const byId = new Map<string, AppChatRecentSession>();

  for (const entry of [...remote, ...local]) {
    const sessionId = entry.sessionId.trim();
    if (!sessionId || !entry.preview.trim()) continue;
    const endedAt =
      'endedAt' in entry && entry.endedAt != null && String(entry.endedAt).trim()
        ? String(entry.endedAt).trim()
        : entry.endedAt === null
          ? null
          : undefined;
    const next: AppChatRecentSession = {
      sessionId,
      preview: entry.preview.trim(),
      updatedAt: entry.updatedAt.trim() || new Date(0).toISOString(),
      ...(endedAt !== undefined ? { endedAt } : {}),
    };
    const prev = byId.get(sessionId);
    if (!prev) {
      byId.set(sessionId, next);
      continue;
    }
    const prevTime = Date.parse(prev.updatedAt) || 0;
    const nextTime = Date.parse(next.updatedAt) || 0;
    if (nextTime >= prevTime) {
      byId.set(sessionId, {
        ...next,
        // Prefer an explicit endedAt from either side.
        endedAt: next.endedAt ?? prev.endedAt,
      });
    } else if (prev.endedAt == null && next.endedAt) {
      byId.set(sessionId, { ...prev, endedAt: next.endedAt });
    }
  }

  return [...byId.values()]
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, cap);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a Recent row timestamp: "now" (same minute), HH:mm (same day), or DD/MM/YYYY.
 */
export function formatRecentSessionTimeLabel(
  updatedAt: string,
  now: Date = new Date(),
  nowLabel = 'now',
): string {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return nowLabel;

  const date = new Date(time);
  const sameMinute =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate() &&
    date.getHours() === now.getHours() &&
    date.getMinutes() === now.getMinutes();

  if (sameMinute || now.getTime() - time < 60_000) {
    return nowLabel;
  }

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}
