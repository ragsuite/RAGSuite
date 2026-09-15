import {
  getDashboardChatSessionIndexKey,
  getEmbedChatSessionIndexKey,
  markSessionIndexEntryEnded,
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
    writeSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'localhost:9201'), []);
    writeSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'localhost:5001'), []);
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

  it('isolates embed Recent indexes for localhost ports', () => {
    upsertEmbedSessionIndexEntry('proj-1', 'localhost:9201', {
      sessionId: 'port-9201',
      preview: 'license chat',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    upsertEmbedSessionIndexEntry('proj-1', 'localhost:5001', {
      sessionId: 'port-5001',
      preview: 'kbb chat',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });

    expect(
      readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'localhost:9201')).map(
        (e) => e.sessionId,
      ),
    ).toEqual(['port-9201']);
    expect(
      readSessionIndex(getEmbedChatSessionIndexKey('proj-1', 'localhost:5001')).map(
        (e) => e.sessionId,
      ),
    ).toEqual(['port-5001']);
  });

  it('builds site-scoped embed index keys', () => {
    expect(getEmbedChatSessionIndexKey('proj-1', 'Shop.Example.com')).toBe(
      'chat_widget_session_index_proj-1_shop.example.com',
    );
    expect(getEmbedChatSessionIndexKey('proj-1', 'http://localhost:9201')).toBe(
      'chat_widget_session_index_proj-1_localhost:9201',
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

  it('prefers last assistant reply over user question for Recent preview', () => {
    const preview = previewFromMessages(
      [
        { role: 'assistant', content: 'Welcome!', createdAt: '2026-01-01T00:00:00.000Z' },
        { role: 'user', content: 'What is t3planet?', createdAt: '2026-01-01T00:01:00.000Z' },
        {
          role: 'assistant',
          content: 'T3Planet is a TYPO3 ecosystem platform.',
          createdAt: '2026-01-01T00:02:00.000Z',
        },
      ],
      (m) => m.content === 'Welcome!',
    );
    expect(preview).toEqual({
      preview: 'T3Planet is a TYPO3 ecosystem platform.',
      updatedAt: '2026-01-01T00:02:00.000Z',
    });
  });

  it('falls back to user message when no assistant reply yet', () => {
    const preview = previewFromMessages(
      [{ role: 'user', content: 'Only question', createdAt: '2026-01-01T00:01:00.000Z' }],
      () => false,
    );
    expect(preview).toEqual({
      preview: 'Only question',
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

  it('preserves and sets endedAt on upsert and mark ended', () => {
    const key = getDashboardChatSessionIndexKey('proj-end');
    writeSessionIndex(key, []);
    upsertSessionIndexEntry(key, {
      sessionId: 's1',
      preview: 'hello',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    markSessionIndexEntryEnded(key, 's1', '2026-01-01T15:01:00.000Z');
    expect(readSessionIndex(key)[0].endedAt).toBe('2026-01-01T15:01:00.000Z');

    upsertSessionIndexEntry(key, {
      sessionId: 's1',
      preview: 'hello again',
      updatedAt: '2026-01-01T16:00:00.000Z',
    });
    expect(readSessionIndex(key)[0].endedAt).toBe('2026-01-01T15:01:00.000Z');
  });
});
