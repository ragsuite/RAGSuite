import type { AppChatWidgetRecentConversation } from '@/features/app-chat-widget/components/AppChatWidgetMessagesList';

/** Pure helper mirroring Messages list row mapping for unit coverage. */
export function mapRecentSessionsToListItems(
  sessions: Array<{ sessionId: string; preview: string; timeLabel: string }>,
  title: string,
): AppChatWidgetRecentConversation[] {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    title,
    preview: session.preview,
    timeLabel: session.timeLabel,
  }));
}

describe('AppChatWidgetMessagesList recent mapping', () => {
  it('maps multiple sessions for Recent rows', () => {
    const items = mapRecentSessionsToListItems(
      [
        { sessionId: 's1', preview: 'Hello', timeLabel: 'now' },
        { sessionId: 's2', preview: 'Bye', timeLabel: '11:05' },
      ],
      'Apollo',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      sessionId: 's1',
      title: 'Apollo',
      preview: 'Hello',
      timeLabel: 'now',
    });
    expect(items[1].sessionId).toBe('s2');
  });
});
