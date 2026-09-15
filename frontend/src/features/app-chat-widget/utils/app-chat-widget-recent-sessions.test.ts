import type { ChatHistoryApiRow } from '@/features/chat-history/types/chat-history.types';
import {
  formatRecentSessionTimeLabel,
  groupHistoryRowsToRecentSessions,
  mergeRecentSessions,
} from '@/features/app-chat-widget/utils/app-chat-widget-recent-sessions';

function row(partial: Partial<ChatHistoryApiRow> & { session_id: string }): ChatHistoryApiRow {
  return {
    id: partial.id ?? '1',
    message_id: partial.message_id ?? partial.id ?? '1',
    session_id: partial.session_id,
    user_message: partial.user_message ?? '',
    assistant_response: partial.assistant_response ?? '',
    message_type: 'chat',
    sources: partial.sources ?? null,
    feedback: null,
    feedback_rating: null,
    feedback_text: null,
    context_tags: null,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    history_status: 'success',
    history_confidence: null,
    history_total_ms: 0,
  };
}

describe('app-chat-widget-recent-sessions', () => {
  it('groups history rows by session using the newest preview', () => {
    const grouped = groupHistoryRowsToRecentSessions([
      row({
        session_id: 's1',
        assistant_response: 'older',
        created_at: '2026-01-01T10:00:00.000Z',
      }),
      row({
        session_id: 's1',
        assistant_response: '**newer** bold',
        created_at: '2026-01-01T12:00:00.000Z',
      }),
      row({
        session_id: 's2',
        user_message: 'question',
        created_at: '2026-01-01T11:00:00.000Z',
      }),
    ]);

    expect(grouped.map((g) => g.sessionId)).toEqual(['s1', 's2']);
    expect(grouped[0].preview).toBe('newer bold');
    expect(grouped[1].preview).toBe('question');
  });

  it('merges local and remote preferring newer timestamps', () => {
    const merged = mergeRecentSessions(
      [
        {
          sessionId: 's1',
          preview: 'local-old',
          updatedAt: '2026-01-01T09:00:00.000Z',
        },
        {
          sessionId: 's3',
          preview: 'local-only',
          updatedAt: '2026-01-01T13:00:00.000Z',
        },
      ],
      [
        {
          sessionId: 's1',
          preview: 'remote-new',
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
        {
          sessionId: 's2',
          preview: 'remote-only',
          updatedAt: '2026-01-01T11:00:00.000Z',
        },
      ],
    );

    expect(merged.map((m) => m.sessionId)).toEqual(['s3', 's1', 's2']);
    expect(merged.find((m) => m.sessionId === 's1')?.preview).toBe('remote-new');
  });

  it('preserves endedAt when merging local and remote recent rows', () => {
    const merged = mergeRecentSessions(
      [
        {
          sessionId: 's1',
          preview: 'ended local',
          updatedAt: '2026-01-01T12:00:00.000Z',
          endedAt: '2026-01-01T12:00:00.000Z',
        },
      ],
      [
        {
          sessionId: 's1',
          preview: 'remote preview',
          updatedAt: '2026-01-01T11:00:00.000Z',
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].endedAt).toBe('2026-01-01T12:00:00.000Z');
    expect(merged[0].preview).toBe('ended local');
  });

  it('formats time labels as now, time of day, or date', () => {
    const now = new Date(2026, 8, 14, 16, 24, 30);
    expect(
      formatRecentSessionTimeLabel(new Date(2026, 8, 14, 16, 24, 10).toISOString(), now, 'now'),
    ).toBe('now');

    expect(
      formatRecentSessionTimeLabel(new Date(2026, 8, 14, 11, 5, 0).toISOString(), now, 'now'),
    ).toBe('11:05');

    expect(
      formatRecentSessionTimeLabel(new Date(2026, 8, 11, 10, 0, 0).toISOString(), now, 'now'),
    ).toBe('11/09/2026');
  });
});
