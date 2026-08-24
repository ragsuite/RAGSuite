import {
  appendChatSessionQuery,
  readHostChatSessionId,
} from '@/shared/utils/widget-embed-session-query';

describe('widget-embed-session-query', () => {
  it('returns undefined when the project id or key is missing', () => {
    expect(readHostChatSessionId('', () => 'sess')).toBeUndefined();
    expect(readHostChatSessionId('proj-1', () => null)).toBeUndefined();
    expect(readHostChatSessionId('proj-1', () => '   ')).toBeUndefined();
  });

  it('reads chat_widget_session_<projectId> from host storage', () => {
    const store: Record<string, string> = {
      'chat_widget_session_proj-1': 'abc-123',
    };
    expect(readHostChatSessionId('proj-1', (key) => store[key] ?? null)).toBe('abc-123');
  });

  it('swallows SecurityError from partitioned / blocked storage', () => {
    expect(
      readHostChatSessionId('proj-1', () => {
        throw new Error('SecurityError');
      }),
    ).toBeUndefined();
  });

  it('appends sessionId to the embed query when present', () => {
    const params = appendChatSessionQuery(
      new URLSearchParams({ projectId: 'proj-1' }),
      'sess-9',
    );
    expect(params.get('sessionId')).toBe('sess-9');
    expect(params.get('projectId')).toBe('proj-1');
    const empty = appendChatSessionQuery(new URLSearchParams(), undefined);
    expect(empty.get('sessionId')).toBeNull();
    const url = `https://admin.example.com/embed/chatbot?${params.toString()}`;
    expect(url).toContain('sessionId=sess-9');
  });
});
