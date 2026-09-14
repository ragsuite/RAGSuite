import {
  getDashboardChatSessionIndexKey,
  getEmbedChatSessionIndexKey,
  previewFromMessages,
  readSessionIndex,
  removeEmbedSessionIndexEntry,
  removeSessionIndexEntry,
  removeSharedSessionIndexEntry,
  SESSION_INDEX_CAP,
  upsertEmbedSessionIndexEntry,
  upsertSessionIndexEntry,
  upsertSharedSessionIndexEntry,
  writeSessionIndex,
} from '@/features/app-chat-widget/utils/app-chat-widget-session-index';

describe('app-chat-widget-session-index', () => {
  const key = 'test_session_index';

  beforeEach(() => {
    writeSessionIndex(key, []);
    writeSessionIndex(getDashboardChatSessionIndexKey('proj-1'), []);
    writeSessionIndex(getEmbedChatSessionIndexKey('proj-1'), []);
    writeSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'shop.example.com'), []);
    writeSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'help.example.com'), []);
  });

  it('upserts, sorts newest first, and removes entries', () => {
    upsertSessionIndexEntry(key, {
      sessionId: 'a',
      preview: 'first',
      updatedAt: '2026-01-01T10:00:00.000Z',
    });
    upsertSessionIndexEntry(key, {
      sessionId: 'b',
      preview: 'second',
      updatedAt: '2026-01-02T10:00:00.000Z',
    });
    upsertSessionIndexEntry(key, {
      sessionId: 'a',
      preview: 'first-updated',
      updatedAt: '2026-01-03T10:00:00.000Z',
    });

    const listed = readSessionIndex(key);
    expect(listed.map((e) => e.sessionId)).toEqual(['a', 'b']);
    expect(listed[0].preview).toBe('first-updated');

    removeSessionIndexEntry(key, 'a');
    expect(readSessionIndex(key).map((e) => e.sessionId)).toEqual(['b']);
  });

  it('caps the index at SESSION_INDEX_CAP', () => {
    for (let i = 0; i < SESSION_INDEX_CAP + 5; i += 1) {
      upsertSessionIndexEntry(key, {
        sessionId: `s-${i}`,
        preview: `p-${i}`,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      });
    }
    expect(readSessionIndex(key)).toHaveLength(SESSION_INDEX_CAP);
    expect(readSessionIndex(key)[0].sessionId).toBe(`s-${SESSION_INDEX_CAP + 4}`);
  });

  it('writes shared dashboard index only (not unscoped embed)', () => {
    upsertSharedSessionIndexEntry('proj-1', {
      sessionId: 'sess-1',
      preview: 'hello',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(readSessionIndex(getDashboardChatSessionIndexKey('proj-1'))[0].sessionId).toBe(
      'sess-1',
    );
    expect(readSessionIndex(getEmbedChatSessionIndexKey('proj-1'))).toEqual([]);

    removeSharedSessionIndexEntry('proj-1', 'sess-1');
    expect(readSessionIndex(getDashboardChatSessionIndexKey('proj-1'))).toEqual([]);
  });

  it('isolates embed Recent indexes per site host', () => {
    upsertEmbedSessionIndexEntry('proj-1', 'shop.example.com', {
      sessionId: 'shop-1',
      preview: 'order status',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    upsertEmbedSessionIndexEntry('proj-1', 'help.example.com', {
      sessionId: 'help-1',
      preview: 'reset password',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });

    expect(
      readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'shop.example.com')).map(
        (e) => e.sessionId,
      ),
    ).toEqual(['shop-1']);
    expect(
      readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'help.example.com')).map(
        (e) => e.sessionId,
      ),
    ).toEqual(['help-1']);

    removeEmbedSessionIndexEntry('proj-1', 'shop.example.com', 'shop-1');
    expect(readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'shop.example.com'))).toEqual(
      [],
    );
    expect(
      readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'help.example.com'))[0].sessionId,
    ).toBe('help-1');
  });

  it('builds site-scoped embed index keys', () => {
    expect(getEmbedChatSessionIndexKey('proj-1', 'Shop.Example.com')).toBe(
      'chat_widget_session_index_proj-1_shop.example.com',
    );
    expect(getEmbedChatSessionIndexKey('proj-1', 'help.example.com')).not.toBe(
      getEmbedChatSessionIndexKey('proj-1', 'shop.example.com'),
    );
  });

  it('builds preview from messages skipping welcome', () => {
    const preview = previewFromMessages(
      [
        { role: 'assistant', content: 'Welcome!', createdAt: '2026-01-01T00:00:00.000Z' },
        { role: 'user', content: 'Hi there', createdAt: '2026-01-01T00:01:00.000Z' },
      ],
      (m) => m.content === 'Welcome!',
    );
    expect(preview).toEqual({
      preview: 'Hi there',
      updatedAt: '2026-01-01T00:01:00.000Z',
    });
  });

  it('strips markdown markers from recent previews', () => {
    const preview = previewFromMessages(
      [
        {
          role: 'assistant',
          content: 'The headquarters of **T3Planet** are located in **Karlsruhe**.',
          createdAt: '2026-01-01T00:02:00.000Z',
        },
      ],
      () => false,
    );
    expect(preview?.preview).toBe(
      'The headquarters of T3Planet are located in Karlsruhe.',
    );
  });
});
