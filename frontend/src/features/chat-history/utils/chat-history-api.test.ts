import { parseChatHistoryRowsResponse } from '@/features/chat-history/utils/chat-history-api';

describe('parseChatHistoryRowsResponse', () => {
  it('parses paginated envelope with total', () => {
    const parsed = parseChatHistoryRowsResponse({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_id: 's1',
          message_id: '22222222-2222-4222-8222-222222222222',
          user_message: 'hello',
          assistant_response: 'hi',
          message_type: 'chat',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 41,
      limit: 20,
      offset: 0,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.total).toBe(41);
  });

  it('parses bare array without total', () => {
    const parsed = parseChatHistoryRowsResponse([
      {
        id: '11111111-1111-4111-8111-111111111111',
        session_id: 's1',
        message_id: '22222222-2222-4222-8222-222222222222',
        user_message: 'hello',
        assistant_response: 'hi',
        message_type: 'chat',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.total).toBeUndefined();
  });
});
