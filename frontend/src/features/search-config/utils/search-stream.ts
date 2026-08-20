import type { SearchTestCitation } from '@/features/search-config/types/search-config.types';

export type SearchStreamDonePayload = {
  answer: string;
  sources: SearchTestCitation[];
  message_id: string;
  session_id: string;
};

export type SearchStreamHandlers = {
  onToken?: (token: string, accumulated: string) => void;
  onSources?: (sources: SearchTestCitation[]) => void;
  onDone?: (payload: SearchStreamDonePayload) => void;
};

function mapStreamSource(source: unknown, index: number): SearchTestCitation | null {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  return {
    id: typeof row.id === 'string' ? row.id : `src_${index}`,
    title: typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : 'Untitled Source',
    url: typeof row.url === 'string' ? row.url : typeof row.link === 'string' ? row.link : '#',
    excerpt:
      typeof row.snippet === 'string'
        ? row.snippet
        : typeof row.excerpt === 'string'
          ? row.excerpt
          : typeof row.content === 'string'
            ? row.content
            : '',
    image:
      typeof row.image === 'string' && row.image.trim()
        ? row.image
        : typeof row.og_image === 'string'
          ? row.og_image
          : '',
  };
}

/**
 * Consumes POST /search/stream SSE (reference format: `data: {"token"|"done"|"sources"}`).
 */
export async function consumeSearchStream(
  response: Response,
  handlers: SearchStreamHandlers = {},
): Promise<SearchStreamDonePayload> {
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || 'errors.search.streamFailed');
  }
  if (!response.body) {
    throw new Error('errors.chat.streamNoBody');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let sseBuf = '';
  let donePayload: SearchStreamDonePayload | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    sseBuf += decoder.decode(value, { stream: true });
    while (true) {
      const nl = sseBuf.indexOf('\n');
      if (nl < 0) break;
      const rawLine = sseBuf.slice(0, nl);
      sseBuf = sseBuf.slice(nl + 1);
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data:')) continue;

      const raw = line.slice('data:'.length).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.token === 'string' && !parsed.done) {
          const next = accumulated + parsed.token;
          // Don't paint the internal OOC sentinel while streaming — final_answer
          // replaces it with extractive or friendly copy on done.
          if (next.includes('QUERY_OUT_OF_CONTEXT')) {
            accumulated = next;
            handlers.onToken?.(parsed.token, '');
          } else {
            accumulated = next;
            handlers.onToken?.(parsed.token, accumulated);
          }
        }
        if (!parsed.done && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          const earlySources = (parsed.sources as unknown[])
            .map((s, i) => mapStreamSource(s, i))
            .filter((r): r is SearchTestCitation => r != null);
          if (earlySources.length > 0) handlers.onSources?.(earlySources);
        }
        if (parsed.done) {
          const rawSources = Array.isArray(parsed.sources) ? parsed.sources : [];
          const finalAnswer =
            typeof parsed.final_answer === 'string' && parsed.final_answer.trim()
              ? parsed.final_answer
              : accumulated;
          const normalizedAnswer =
            finalAnswer.trim() === 'QUERY_OUT_OF_CONTEXT' || finalAnswer.includes('QUERY_OUT_OF_CONTEXT')
              ? 'I am sorry, this query is out of the context of the provided documents.'
              : finalAnswer;
          donePayload = {
            answer: normalizedAnswer,
            sources: rawSources
              .map((source, index) => mapStreamSource(source, index))
              .filter((row): row is SearchTestCitation => row != null),
            message_id: typeof parsed.message_id === 'string' ? parsed.message_id : '',
            session_id: typeof parsed.session_id === 'string' ? parsed.session_id : '',
          };
          handlers.onDone?.(donePayload);
          return donePayload;
        }
      } catch {
        // skip malformed SSE line
      }
    }
  }

  if (donePayload) return donePayload;

  const normalizedAccumulated =
    accumulated.trim() === 'QUERY_OUT_OF_CONTEXT' || accumulated.includes('QUERY_OUT_OF_CONTEXT')
      ? 'I am sorry, this query is out of the context of the provided documents.'
      : accumulated;

  const fallback: SearchStreamDonePayload = {
    answer: normalizedAccumulated,
    sources: [],
    message_id: '',
    session_id: '',
  };
  if (normalizedAccumulated) handlers.onDone?.(fallback);
  return fallback;
}

export type SearchStreamRequestBody = {
  query: string;
  top_k?: number;
  topK?: number;
  use_reranker?: boolean;
  useReranker?: boolean;
  similarity_threshold?: number;
  similarityThreshold?: number;
  max_tokens?: number;
  maxTokens?: number;
  response_type?: 'long' | 'short';
  session_id?: string;
};

export function buildSearchStreamRequestBody(input: {
  query: string;
  topK: number;
  similarityThreshold: number;
  useReranker: boolean;
  maxTokens?: number;
  responseType?: 'long' | 'short';
  sessionId?: string;
}): SearchStreamRequestBody {
  const body: SearchStreamRequestBody = {
    query: input.query,
    top_k: input.topK,
    topK: input.topK,
    use_reranker: input.useReranker,
    useReranker: input.useReranker,
    similarity_threshold: input.similarityThreshold,
    similarityThreshold: input.similarityThreshold,
  };
  if (input.maxTokens != null && input.maxTokens > 0) {
    body.max_tokens = input.maxTokens;
    body.maxTokens = input.maxTokens;
  }
  if (input.responseType) {
    body.response_type = input.responseType;
  }
  if (input.sessionId) {
    body.session_id = input.sessionId;
  }
  return body;
}
