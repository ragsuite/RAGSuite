import type { ChatHistoryApiRow } from '@/features/chat-history/types/chat-history.types';
import { mapRowToQueryDetail } from '@/features/chat-history/utils/chat-query-mapper';

function row(partial: Partial<ChatHistoryApiRow> = {}): ChatHistoryApiRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    session_id: 's1',
    message_id: '22222222-2222-4222-8222-222222222222',
    user_message: 'What is RAGSuite?',
    assistant_response: 'A RAG platform.',
    message_type: 'chat',
    sources: null,
    feedback: null,
    feedback_rating: null,
    feedback_text: null,
    context_tags: null,
    created_at: '2026-01-01T00:00:00Z',
    history_status: 'success',
    history_confidence: null,
    history_total_ms: 40,
    execution_snapshot: null,
    ...partial,
  };
}

describe('mapRowToQueryDetail vector store', () => {
  it('does not invent chroma or pgvector when snapshot is missing', () => {
    const detail = mapRowToQueryDetail(row());
    expect(detail.parameters.vector_store).toBeUndefined();
    expect(JSON.stringify(detail.parameters)).not.toMatch(/chroma|pgvector/i);
  });

  it('uses the snapshot store name when present', () => {
    const detail = mapRowToQueryDetail(
      row({
        execution_snapshot: {
          schema_version: 2,
          status: 'success',
          session_id: 's1',
          assistant_message_id: '22222222-2222-4222-8222-222222222222',
          runtime_params: {
            temperature: null,
            top_k: 5,
            similarity_threshold: 0.5,
            max_tokens: 800,
            use_reranker: false,
            reranker_model_name: null,
            embedding_provider: null,
            embedding_model: null,
            llm_provider: null,
            llm_model: null,
            hybrid_search: false,
            vector_store: 'elasticsearch',
            collection_name: null,
            chatbot_language: null,
          },
          retrieval_meta: {},
          token_usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
          timings_ms: {
            total_ms: 40,
            retrieval_ms: null,
            reranking_ms: null,
            llm_generation_ms: null,
            streaming_ms: null,
          },
          confidence_score: null,
          sources_trace: [],
          quality: {},
        },
      }),
    );
    expect(detail.parameters.vector_store).toBe('elasticsearch');
  });
});
