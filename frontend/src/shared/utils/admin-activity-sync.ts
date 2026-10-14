export const ADMIN_ACTIVITY_EVENT = 'ragsuite:admin-activity';
export const ADMIN_ACTIVITY_CHANNEL = 'ragsuite:admin-activity';

export type AdminActivityKind = 'chatbot' | 'search';
export type AdminActivityType = 'query' | 'feedback';

export type AdminActivityDetail = {
  kind: AdminActivityKind;
  type: AdminActivityType;
  projectId?: string;
  sessionId?: string;
};

type AdminActivityListener = (detail: AdminActivityDetail) => void;

type ChannelMessage = AdminActivityDetail & { sourceId: string };

/** Identifies this JS realm so it ignores its own BroadcastChannel posts (same-window uses the DOM event). */
const SOURCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const nativeListeners = new Set<AdminActivityListener>();

function hasDomEvents(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof window.dispatchEvent === 'function'
  );
}

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(ADMIN_ACTIVITY_CHANNEL);
  } catch {
    return null;
  }
}

export function isAdminActivityDetail(value: unknown): value is AdminActivityDetail {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'chatbot' && record.kind !== 'search') return false;
  if (record.type !== 'query' && record.type !== 'feedback') return false;
  if (record.projectId !== undefined && typeof record.projectId !== 'string') return false;
  if (record.sessionId !== undefined && typeof record.sessionId !== 'string') return false;
  return true;
}

function normalizeDetail(detail: AdminActivityDetail): AdminActivityDetail {
  const out: AdminActivityDetail = { kind: detail.kind, type: detail.type };
  const projectId = detail.projectId?.trim();
  const sessionId = detail.sessionId?.trim();
  if (projectId) out.projectId = projectId;
  if (sessionId) out.sessionId = sessionId;
  return out;
}

/** Tell open History / Feedback screens that a chatbot or search query/feedback just landed. */
export function notifyAdminActivity(detail: AdminActivityDetail): void {
  const normalized = normalizeDetail(detail);

  if (!hasDomEvents()) {
    nativeListeners.forEach((listener) => listener(normalized));
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AdminActivityDetail>(ADMIN_ACTIVITY_EVENT, { detail: normalized }),
  );

  const channel = openChannel();
  if (!channel) return;
  try {
    const message: ChannelMessage = { ...normalized, sourceId: SOURCE_ID };
    channel.postMessage(message);
  } catch {
    // Other tabs fall back to the History / Feedback background poll.
  } finally {
    channel.close();
  }
}

export function subscribeAdminActivity(listener: AdminActivityListener): () => void {
  if (!hasDomEvents()) {
    nativeListeners.add(listener);
    return () => nativeListeners.delete(listener);
  }

  const onWindowEvent = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (isAdminActivityDetail(detail)) listener(detail);
  };
  window.addEventListener(ADMIN_ACTIVITY_EVENT, onWindowEvent);

  const channel = openChannel();
  const onChannelMessage = (event: MessageEvent) => {
    const data = event.data as Partial<ChannelMessage> | null;
    if (!data || data.sourceId === SOURCE_ID || !isAdminActivityDetail(data)) return;
    listener(normalizeDetail(data));
  };
  channel?.addEventListener('message', onChannelMessage);

  return () => {
    window.removeEventListener(ADMIN_ACTIVITY_EVENT, onWindowEvent);
    if (channel) {
      channel.removeEventListener('message', onChannelMessage);
      channel.close();
    }
  };
}
