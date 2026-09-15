import {
  getDashboardChatSessionKey,
  getEmbedChatSessionKey,
  readStoredSessionId,
  resolveSessionIdForHistoryLoad,
  writeEmbedChatSessionId,
  writeSharedChatSessionId,
} from '@/features/app-chat-widget/utils/app-chat-widget-session';

describe('writeSharedChatSessionId', () => {
  it('writes the same session id to dashboard and unscoped embed keys', () => {
    writeSharedChatSessionId('proj-1', 'sess-abc');

    expect(readStoredSessionId(getDashboardChatSessionKey('proj-1'))).toBe('sess-abc');
    expect(readStoredSessionId(getEmbedChatSessionKey('proj-1'))).toBe('sess-abc');
  });

  it('ignores empty project or session ids', () => {
    writeSharedChatSessionId('  ', 'sess-empty');
    writeSharedChatSessionId('proj-empty', '  ');
    expect(readStoredSessionId(getDashboardChatSessionKey('proj-empty'))).toBeUndefined();
    expect(readStoredSessionId(getEmbedChatSessionKey('proj-empty'))).toBeUndefined();
  });
});

describe('resolveSessionIdForHistoryLoad', () => {
  it('prefers explicit Recent / switch target over stored live id', () => {
    expect(
      resolveSessionIdForHistoryLoad({ explicit: 'B', stored: 'A' }),
    ).toBe('B');
  });

  it('falls back to stored when explicit is omitted', () => {
    expect(resolveSessionIdForHistoryLoad({ stored: 'A' })).toBe('A');
    expect(resolveSessionIdForHistoryLoad({ explicit: '  ', stored: 'A' })).toBe('A');
  });

  it('returns undefined when neither is set', () => {
    expect(resolveSessionIdForHistoryLoad({})).toBeUndefined();
    expect(
      resolveSessionIdForHistoryLoad({ explicit: null, stored: null }),
    ).toBeUndefined();
  });
});

describe('site-scoped embed session keys', () => {
  it('uses different keys per parent website', () => {
    expect(getEmbedChatSessionKey('proj-1', 'shop.example.com')).toBe(
      'chat_widget_session_proj-1_shop.example.com',
    );
    expect(getEmbedChatSessionKey('proj-1', 'help.example.com')).not.toBe(
      getEmbedChatSessionKey('proj-1', 'shop.example.com'),
    );
  });

  it('uses different keys for localhost on different ports', () => {
    expect(getEmbedChatSessionKey('proj-1', 'localhost:9201')).toBe(
      'chat_widget_session_proj-1_localhost:9201',
    );
    expect(getEmbedChatSessionKey('proj-1', 'localhost:5001')).not.toBe(
      getEmbedChatSessionKey('proj-1', 'localhost:9201'),
    );
  });

  it('writes embed session only for that site host', () => {
    writeEmbedChatSessionId('proj-1', 'shop.example.com', 'sess-shop');
    writeEmbedChatSessionId('proj-1', 'help.example.com', 'sess-help');

    expect(readStoredSessionId(getEmbedChatSessionKey('proj-1', 'shop.example.com'))).toBe(
      'sess-shop',
    );
    expect(readStoredSessionId(getEmbedChatSessionKey('proj-1', 'help.example.com'))).toBe(
      'sess-help',
    );
    // Site-scoped writes must not overwrite each other.
    expect(readStoredSessionId(getEmbedChatSessionKey('proj-1', 'shop.example.com'))).not.toBe(
      'sess-help',
    );
  });
});
