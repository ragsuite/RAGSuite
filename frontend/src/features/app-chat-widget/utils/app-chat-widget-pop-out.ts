import { API_CONFIG } from '@/network/apiUrl';
import { appendChatSessionQuery } from '@/shared/utils/widget-embed-session-query';
import {
  CHAT_WIDGET_POP_OUT_WINDOW_NAME,
  publishChatWidgetPopOutSync,
  registerChatWidgetPopOutWindow,
} from '@/features/app-chat-widget/utils/app-chat-widget-pop-out-sync';
import { writeSharedChatSessionId } from '@/features/app-chat-widget/utils/app-chat-widget-session';

const POP_OUT_WIDTH = 420;
const POP_OUT_HEIGHT = 720;

export type ChatWidgetPopOutParams = {
  projectId: string;
  sessionId?: string | null;
};

/** Query flag for standalone popup windows (`/embed/chatbot?...&pop=1`). */
export const CHAT_WIDGET_POP_OUT_QUERY = 'pop';

export function isStandalonePopOutParam(value: string | string[] | undefined | null): boolean {
  const raw = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Opens the public embed chatbot in a sized browser popup (web only).
 * Continues the same session when `sessionId` is provided.
 * Always includes `pop=1` so the popup auto-opens full-window.
 * Aligns dashboard + embed session keys and broadcasts handoff.
 */
export function openChatWidgetPopOut(params: ChatWidgetPopOutParams): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;

  const projectId = String(params.projectId || '').trim();
  if (!projectId) return false;

  const sessionId = String(params.sessionId || '').trim() || undefined;
  if (sessionId) {
    writeSharedChatSessionId(projectId, sessionId);
  }

  const apiEndpoint = `${String(API_CONFIG.BASE_URL || '').replace(/\/+$/, '')}/api/v1`;
  const query = appendChatSessionQuery(
    new URLSearchParams({
      projectId,
      apiEndpoint,
      [CHAT_WIDGET_POP_OUT_QUERY]: '1',
    }),
    sessionId,
  );

  const origin = String(window.location?.origin || '').replace(/\/+$/, '');
  if (!origin) return false;

  const url = `${origin}/embed/chatbot?${query.toString()}`;
  const screenWidth = Number(window.screen?.width) || POP_OUT_WIDTH;
  const screenHeight = Number(window.screen?.height) || POP_OUT_HEIGHT;
  const left = Math.max(0, Math.round((screenWidth - POP_OUT_WIDTH) / 2));
  const top = Math.max(0, Math.round((screenHeight - POP_OUT_HEIGHT) / 2));
  const features = [
    `width=${POP_OUT_WIDTH}`,
    `height=${POP_OUT_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');

  const popup = window.open(url, CHAT_WIDGET_POP_OUT_WINDOW_NAME, features);
  if (!popup) return false;

  registerChatWidgetPopOutWindow(popup);
  publishChatWidgetPopOutSync({
    type: 'opened',
    projectId,
    sessionId,
  });
  return true;
}
