export const CHAT_WIDGET_POP_OUT_WINDOW_NAME = 'ragsuite-chat-popout';
export const CHAT_WIDGET_POP_OUT_CHANNEL = 'ragsuite-chat-popout';

export type ChatWidgetPopOutSyncType = 'opened' | 'closed' | 'session';

export type ChatWidgetPopOutSyncMessage = {
  type: ChatWidgetPopOutSyncType;
  projectId: string;
  sessionId?: string;
};

export function isChatWidgetPopOutSyncMessage(value: unknown): value is ChatWidgetPopOutSyncMessage {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const type = record.type;
  const projectId = typeof record.projectId === 'string' ? record.projectId.trim() : '';
  if (!projectId) return false;
  if (type !== 'opened' && type !== 'closed' && type !== 'session') return false;
  if (record.sessionId !== undefined && typeof record.sessionId !== 'string') return false;
  return true;
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHAT_WIDGET_POP_OUT_CHANNEL);
  } catch {
    return null;
  }
}

export function publishChatWidgetPopOutSync(message: ChatWidgetPopOutSyncMessage): void {
  const projectId = String(message.projectId || '').trim();
  if (!projectId) return;
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    const payload: ChatWidgetPopOutSyncMessage = {
      type: message.type,
      projectId,
    };
    const sessionId = String(message.sessionId || '').trim();
    if (sessionId) payload.sessionId = sessionId;
    channel.postMessage(payload);
  } finally {
    channel.close();
  }
}

export function subscribeChatWidgetPopOutSync(
  onMessage: (message: ChatWidgetPopOutSyncMessage) => void,
): () => void {
  const channel = getBroadcastChannel();
  if (!channel) return () => undefined;

  const handler = (event: MessageEvent) => {
    if (!isChatWidgetPopOutSyncMessage(event.data)) return;
    onMessage(event.data);
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}

/** Opener-side handle for the pop-out Window. Never use window.open('', name) — that creates about:blank after close. */
let registeredPopOutWindow: Window | null = null;

export function registerChatWidgetPopOutWindow(win: Window | null): void {
  registeredPopOutWindow = win;
}

export function clearChatWidgetPopOutWindow(): void {
  registeredPopOutWindow = null;
}

/** True when a registered pop-out Window still exists and is open. */
export function isChatWidgetPopOutWindowOpen(): boolean {
  const win = registeredPopOutWindow;
  if (!win) return false;
  if (win.closed) {
    registeredPopOutWindow = null;
    return false;
  }
  return true;
}

/** Focus the registered pop-out window when still open. */
export function focusChatWidgetPopOutWindow(): boolean {
  if (!isChatWidgetPopOutWindowOpen() || !registeredPopOutWindow) return false;
  try {
    registeredPopOutWindow.focus();
    return true;
  } catch {
    clearChatWidgetPopOutWindow();
    return false;
  }
}
