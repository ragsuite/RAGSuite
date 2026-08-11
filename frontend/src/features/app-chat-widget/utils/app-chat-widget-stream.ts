import type {
  AppChatCitation,
  AppChatSendResult,
  AppChatStreamHandlers,
} from '@/features/app-chat-widget/types/app-chat-widget.types';
import {
  normalizeChatCitation,
  shouldHideChatCitations,
} from '@/features/app-chat-widget/utils/app-chat-widget-citations';
import { resolveStreamFinalAnswer } from '@/shared/utils/stream-answer-links';
import { extractApiErrorMessage } from '@/utils/api-error';
import { mapStreamErrorContent } from '@/shared/utils/map-stream-error-content';

function mapSources(raw: unknown[] | undefined): AppChatCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((source) => normalizeChatCitation(source));
}

function parseSsePayload(
  payload: string,
  state: {
    accumulated: string;
    firstToken: boolean;
    finalMessageId?: string;
    finalSessionId?: string;
    streamSources?: AppChatCitation[];
  },
  handlers: AppChatStreamHandlers,
) {
  if (!payload) return;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.token === 'string') {
      if (state.firstToken) {
        state.firstToken = false;
        handlers.onTyping?.();
      }
      state.accumulated += parsed.token;
      handlers.onToken?.(state.accumulated);
    }
    if (parsed.done) {
      state.accumulated = mapStreamErrorContent(
        resolveStreamFinalAnswer(
          { final_answer: parsed.final_answer, answer_updated: parsed.answer_updated },
          state.accumulated,
        ),
      );
      handlers.onToken?.(state.accumulated);
      state.finalMessageId =
        typeof parsed.message_id === 'string'
          ? parsed.message_id
          : typeof parsed.messageId === 'string'
            ? parsed.messageId
            : undefined;
      state.finalSessionId =
        typeof parsed.session_id === 'string'
          ? parsed.session_id
          : typeof parsed.sessionId === 'string'
            ? parsed.sessionId
            : undefined;
      if (Array.isArray(parsed.sources)) {
        state.streamSources = mapSources(parsed.sources);
      }
    }
  } catch {
    // skip malformed SSE payloads
  }
}

function parseSseLines(text: string, handlers: AppChatStreamHandlers) {
  const state = {
    accumulated: '',
    firstToken: true,
    finalMessageId: undefined as string | undefined,
    finalSessionId: undefined as string | undefined,
    streamSources: undefined as AppChatCitation[] | undefined,
  };

  let buffer = text;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const rawLine = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) continue;
    parseSsePayload(line.slice('data:'.length).trim(), state, handlers);
  }

  const trailing = buffer.trim();
  if (trailing.startsWith('data:')) {
    parseSsePayload(trailing.slice('data:'.length).trim(), state, handlers);
  }

  return state;
}

function buildChatSendResult(state: ReturnType<typeof parseSseLines>): AppChatSendResult {
  const answer = mapStreamErrorContent(state.accumulated.trim() || 'Something went wrong. Please try again.');
  const sources =
    state.streamSources && state.streamSources.length > 0 && !shouldHideChatCitations(answer)
      ? state.streamSources
      : undefined;

  if (!state.finalSessionId) {
    throw new Error('errors.chat.emptyStreamResponse');
  }

  return {
    sessionId: state.finalSessionId,
    messageId: state.finalMessageId,
    answer,
    sources,
  };
}

export async function readChatSseStream(
  stream: ReadableStream<Uint8Array>,
  handlers: AppChatStreamHandlers,
): Promise<AppChatSendResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  const state = {
    accumulated: '',
    firstToken: true,
    finalMessageId: undefined as string | undefined,
    finalSessionId: undefined as string | undefined,
    streamSources: undefined as AppChatCitation[] | undefined,
  };
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const rawLine = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data:')) continue;
      parseSsePayload(line.slice('data:'.length).trim(), state, handlers);
    }
  }

  const trailing = buffer.trim();
  if (trailing.startsWith('data:')) {
    parseSsePayload(trailing.slice('data:'.length).trim(), state, handlers);
  }

  return buildChatSendResult(state);
}

export async function consumeChatMessageStream(
  response: Response,
  handlers: AppChatStreamHandlers,
): Promise<AppChatSendResult> {
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let message = errText.trim();
    if (message) {
      try {
        message = extractApiErrorMessage(JSON.parse(message), message);
      } catch {
        // keep raw text
      }
    }
    throw new Error(message || `Chat stream failed (${response.status})`);
  }

  if (response.body) {
    try {
      return await readChatSseStream(response.body, handlers);
    } catch {
      // React Native can expose a body that does not stream reliably — fall through to text().
    }
  }

  const text = await response.text();
  const state = parseSseLines(text, handlers);
  return buildChatSendResult(state);
}
