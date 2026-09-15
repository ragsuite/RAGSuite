import {
  formatConversationEndedAtLabel,
  resolveLayout2ThreadMode,
} from '@/features/app-chat-widget/utils/app-chat-widget-thread-mode';

describe('resolveLayout2ThreadMode', () => {
  it('returns live when viewing the live session without endedAt', () => {
    expect(
      resolveLayout2ThreadMode({
        viewingSessionId: 'a',
        liveSessionId: 'a',
        index: [
          {
            sessionId: 'a',
            preview: 'hi',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ).toEqual({ mode: 'live', endedAt: null, showReturnToLive: false });
  });

  it('returns readonly with return-to-live when viewing an ended prior session', () => {
    expect(
      resolveLayout2ThreadMode({
        viewingSessionId: 'a',
        liveSessionId: 'b',
        index: [
          {
            sessionId: 'a',
            preview: 'old',
            updatedAt: '2026-01-01T00:00:00.000Z',
            endedAt: '2026-01-01T12:00:00.000Z',
          },
          {
            sessionId: 'b',
            preview: 'new',
            updatedAt: '2026-01-01T13:00:00.000Z',
          },
        ],
      }),
    ).toEqual({
      mode: 'readonly',
      endedAt: '2026-01-01T12:00:00.000Z',
      showReturnToLive: true,
    });
  });

  it('returns readonly without return-to-live when ended and no other live session', () => {
    expect(
      resolveLayout2ThreadMode({
        viewingSessionId: 'a',
        liveSessionId: 'a',
        index: [
          {
            sessionId: 'a',
            preview: 'done',
            updatedAt: '2026-01-01T00:00:00.000Z',
            endedAt: '2026-01-01T15:01:00.000Z',
          },
        ],
      }),
    ).toEqual({
      mode: 'readonly',
      endedAt: '2026-01-01T15:01:00.000Z',
      showReturnToLive: false,
    });
  });

  it('treats legacy non-live rows without endedAt as readonly with return-to-live', () => {
    expect(
      resolveLayout2ThreadMode({
        viewingSessionId: 'old',
        liveSessionId: 'live',
        index: [
          {
            sessionId: 'old',
            preview: 'legacy',
            updatedAt: '2026-01-01T10:00:00.000Z',
          },
          {
            sessionId: 'live',
            preview: 'current',
            updatedAt: '2026-01-01T11:00:00.000Z',
          },
        ],
      }),
    ).toEqual({
      mode: 'readonly',
      endedAt: '2026-01-01T10:00:00.000Z',
      showReturnToLive: true,
    });
  });

  it('returns live with empty viewing id', () => {
    expect(
      resolveLayout2ThreadMode({
        viewingSessionId: '',
        liveSessionId: 'a',
        index: [],
      }),
    ).toEqual({ mode: 'live', endedAt: null, showReturnToLive: false });
  });
});

describe('formatConversationEndedAtLabel', () => {
  it('formats weekday and local 24h time', () => {
    const label = formatConversationEndedAtLabel(
      new Date(2026, 8, 15, 15, 1, 0).toISOString(),
      'en',
    );
    expect(label).toMatch(/Tuesday/);
    expect(label).toMatch(/15:01/);
  });
});
