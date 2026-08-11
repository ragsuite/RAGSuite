import type {
  AppChatFeedbackSubmitResult,
  AppChatSendResult,
  AppChatStreamHandlers,
} from '@/features/app-chat-widget/types/app-chat-widget.types';
import type { AppChatWidgetFeedbackPayload } from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import {
  normalizeChatCitation,
  shouldHideChatCitations,
} from '@/features/app-chat-widget/utils/app-chat-widget-citations';
import { consumeChatMessageStream } from '@/features/app-chat-widget/utils/app-chat-widget-stream';
import { API_CONFIG } from '@/network/apiUrl';
import {
  handlePostChatMessageStream,
  handleSendChatFeedback,
  handleSendChatMessage,
} from '@/network/actions/app-chat-widget.actions';
import { handleClearChatSession } from '@/network/actions/chatbot-config.actions';
import { handleGetChatHistory } from '@/network/actions/chat-history.actions';
import type { ChatHistoryApiRow } from '@/features/chat-history/types/chat-history.types';

export const APP_CHAT_WIDGET_API = {
  chatMessage: API_CONFIG.CHAT_MESSAGE,
  chatStream: API_CONFIG.CHAT_MESSAGE_STREAM,
  feedback: API_CONFIG.CHAT_FEEDBACK,
} as const;

let activeChatProjectId: string | null = null;

export function configureAppChatWidgetProject(projectId: string | null) {
  activeChatProjectId = projectId;
}

function chatProjectParams() {
  return { projectId: activeChatProjectId };
}

import { mapStreamErrorContent } from '@/shared/utils/map-stream-error-content';

function resolveChatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Sorry, I encountered an error while chatting. Please try again.';
}

function mapSources(raw: unknown[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((source) => normalizeChatCitation(source));
}

export async function streamAppChatMessage(
  message: string,
  sessionId: string | undefined,
  handlers: AppChatStreamHandlers,
  options: { signal?: AbortSignal } = {},
): Promise<AppChatSendResult> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('errors.chat.emptyMessage');

  const payload = { message: trimmed, session_id: sessionId };
  const res = await handlePostChatMessageStream(payload, chatProjectParams(), {
    signal: options.signal,
  });

  try {
    const result = await consumeChatMessageStream(res, handlers);
    if (!result.answer.trim()) {
      return sendAppChatMessageFallback(trimmed, sessionId);
    }
    return result;
  } catch (streamError) {
    if (options.signal?.aborted) {
      throw streamError instanceof Error ? streamError : new Error(resolveChatErrorMessage(streamError));
    }
    try {
      return await sendAppChatMessageFallback(trimmed, sessionId);
    } catch {
      throw streamError instanceof Error ? streamError : new Error(resolveChatErrorMessage(streamError));
    }
  }
}

async function sendAppChatMessageFallback(
  message: string,
  sessionId?: string,
): Promise<AppChatSendResult> {
  const res = await handleSendChatMessage({ message, session_id: sessionId }, chatProjectParams());
  const answer = String(res.answer ?? res.assistant_response ?? res.response ?? '').trim();
  if (!answer) throw new Error('errors.chat.emptyResponse');
  const sources = mapSources(res.sources);
  return {
    sessionId: String(res.session_id ?? res.sessionId ?? sessionId ?? ''),
    messageId: res.message_id ?? res.messageId,
    answer: mapStreamErrorContent(answer),
    sources: sources.length > 0 && !shouldHideChatCitations(answer) ? sources : undefined,
  };
}

export async function loadAppChatSessionHistory(sessionId: string): Promise<ChatHistoryApiRow[]> {
  const rows = await handleGetChatHistory({
    sessionId,
    limit: 50,
    offset: 0,
    projectId: activeChatProjectId ?? undefined,
  });
  return rows;
}

/**
 * Clear the in-widget conversation only.
 * Uses source=widget so messages stay in Chat History (soft-hide).
 * Permanent deletes belong on the History / training admin actions (source=page).
 */
export async function clearAppChatSession(sessionId: string): Promise<void> {
  await handleClearChatSession(sessionId, 'widget');
}

export async function submitAppChatFeedback(
  payload: AppChatWidgetFeedbackPayload,
): Promise<AppChatFeedbackSubmitResult> {
  if (!payload.sessionId?.trim()) {
    throw new Error('errors.chat.missingSession');
  }

  await handleSendChatFeedback(
    {
      session_id: payload.sessionId,
      message_id: payload.messageId,
      feedback: payload.sentiment === 'positive',
      rating: payload.rating,
      feedback_text: payload.comments?.trim() || undefined,
      context_tags: payload.reasons.length > 0 ? payload.reasons : undefined,
    },
    chatProjectParams(),
  );
  return { ok: true };
}

export function mapHistoryRowsToMessages(rows: ChatHistoryApiRow[]) {
  const messages: Array<{
    user: { content: string; createdAt: string };
    assistant: {
      content: string;
      createdAt: string;
      serverMessageId?: string;
      sources?: ReturnType<typeof mapSources>;
    };
  }> = [];

  for (const row of [...rows].reverse()) {
    const answer = row.assistant_response?.trim() ?? '';
    if (!row.user_message && !answer) continue;
    const sources =
      row.sources && row.sources.length > 0 && !shouldHideChatCitations(answer)
        ? row.sources.map((source) => normalizeChatCitation(source))
        : undefined;
    messages.push({
      user: { content: row.user_message, createdAt: row.created_at },
      assistant: {
        content: answer,
        createdAt: row.created_at,
        serverMessageId: row.message_id || row.id,
        sources,
      },
    });
  }

  return messages;
}

export { resolveChatErrorMessage };
