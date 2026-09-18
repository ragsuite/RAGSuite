import { unwrapChatbotApiData } from '@/features/chatbot-config/utils/chatbot-api-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { fetchWithAuth, post } from '@/network/request';

type ChatApiResponse = {
  answer?: string;
  assistant_response?: string;
  response?: string;
  session_id?: string;
  sessionId?: string;
  message_id?: string;
  messageId?: string;
  sources?: unknown[];
};

export type AppChatApiQueryParams = {
  projectId?: string | null;
};

function withProjectQuery(path: string, params: AppChatApiQueryParams = {}): string {
  if (!params.projectId?.trim()) return path;
  const search = new URLSearchParams({ project_id: params.projectId.trim() });
  return `${path}?${search.toString()}`;
}

function withProjectHeaders(
  params: AppChatApiQueryParams,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (params.projectId?.trim()) {
    headers['X-Project-ID'] = params.projectId.trim();
  }
  return headers;
}

function normalizeChatApiResponse(body: unknown): ChatApiResponse {
  const data = unwrapChatbotApiData<ChatApiResponse>(body) ?? (body as ChatApiResponse);
  return data && typeof data === 'object' ? data : {};
}

export async function handleSendChatMessage(
  body: {
    message: string;
    query?: string;
    session_id?: string;
    language?: string;
  },
  params: AppChatApiQueryParams = {},
): Promise<ChatApiResponse> {
  const trimmed = body.message.trim();
  const raw = await post(
    withProjectQuery(API_CONFIG.CHAT_MESSAGE, params),
    {
      ...body,
      message: trimmed,
      query: body.query ?? trimmed,
    },
    {
      headers: withProjectHeaders(params),
    },
  );
  return normalizeChatApiResponse(raw);
}

export async function handlePostChatMessageStream(
  body: { message: string; session_id?: string; language?: string },
  params: AppChatApiQueryParams = {},
  init: { signal?: AbortSignal } = {},
): Promise<Response> {
  return fetchWithAuth(withProjectQuery(API_CONFIG.CHAT_MESSAGE_STREAM, params), {
    method: 'POST',
    headers: withProjectHeaders(params, { Accept: 'text/event-stream' }),
    body: JSON.stringify(body),
    signal: init.signal,
  });
}

export async function handleSendChatFeedback(
  body: Record<string, unknown>,
  params: AppChatApiQueryParams = {},
): Promise<{ ok?: boolean }> {
  return (await post(withProjectQuery(API_CONFIG.CHAT_FEEDBACK, params), body, {
    headers: withProjectHeaders(params),
  })) as { ok?: boolean };
}

export async function handleTranslateChatMessages(
  body: {
    session_id?: string;
    target_language: string;
    messages: Array<{ id: string; role?: string; content: string }>;
  },
  params: AppChatApiQueryParams = {},
): Promise<{ translations: Record<string, string> }> {
  const raw = await post(withProjectQuery(API_CONFIG.CHAT_TRANSLATE_MESSAGES, params), body, {
    headers: withProjectHeaders(params),
    // LLM translation can exceed the default 30s axios timeout.
    timeout: 100_000,
  });

  if (
    raw &&
    typeof raw === 'object' &&
    'status' in raw &&
    (raw as { status?: unknown }).status === false
  ) {
    const message =
      typeof (raw as { message?: unknown }).message === 'string' &&
      (raw as { message: string }).message.trim()
        ? (raw as { message: string }).message.trim()
        : 'Translation failed';
    throw new Error(message);
  }

  const data = unwrapChatbotApiData<{ translations?: Record<string, string> }>(raw) ?? (raw as {
    translations?: Record<string, string>;
  });
  return {
    translations:
      data && typeof data === 'object' && data.translations && typeof data.translations === 'object'
        ? data.translations
        : {},
  };
}
