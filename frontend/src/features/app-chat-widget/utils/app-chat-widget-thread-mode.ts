import type { ChatSessionIndexEntry } from '@/features/app-chat-widget/utils/app-chat-widget-session-index';

export type AppChatThreadMode = 'live' | 'readonly';

export type ResolveThreadModeInput = {
  viewingSessionId: string | null | undefined;
  liveSessionId: string | null | undefined;
  index: ChatSessionIndexEntry[];
};

export type ResolveThreadModeResult = {
  mode: AppChatThreadMode;
  endedAt: string | null;
  showReturnToLive: boolean;
};

/**
 * Layout 2: a session is read-only when it has endedAt, or when the user is
 * viewing a different session than the live one (archived by New Conversation).
 */
export function resolveLayout2ThreadMode(
  input: ResolveThreadModeInput,
): ResolveThreadModeResult {
  const viewing = (input.viewingSessionId || '').trim();
  const live = (input.liveSessionId || '').trim();
  if (!viewing) {
    return { mode: 'live', endedAt: null, showReturnToLive: false };
  }

  const entry = input.index.find((item) => item.sessionId === viewing);
  const endedAt =
    typeof entry?.endedAt === 'string' && entry.endedAt.trim()
      ? entry.endedAt.trim()
      : null;

  if (endedAt) {
    return {
      mode: 'readonly',
      endedAt,
      showReturnToLive: Boolean(live && live !== viewing),
    };
  }

  if (live && viewing === live) {
    return { mode: 'live', endedAt: null, showReturnToLive: false };
  }

  // Viewing a non-live session without endedAt (legacy) → treat as readonly.
  if (live && viewing !== live) {
    return {
      mode: 'readonly',
      endedAt: entry?.updatedAt?.trim() || null,
      showReturnToLive: true,
    };
  }

  return { mode: 'live', endedAt: null, showReturnToLive: false };
}

/**
 * Format "Friday, 15:01" style local weekday + time for conversation-ended label.
 */
export function formatConversationEndedAtLabel(
  endedAt: string,
  locale?: string | null,
): string {
  const time = Date.parse(endedAt);
  if (!Number.isFinite(time)) return '';

  const date = new Date(time);
  const localeTag = (locale || '').trim() || undefined;

  try {
    const weekday = new Intl.DateTimeFormat(localeTag, { weekday: 'long' }).format(date);
    const clock = new Intl.DateTimeFormat(localeTag, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${weekday}, ${clock}`;
  } catch {
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    const weekdays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return `${weekdays[date.getDay()]}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
