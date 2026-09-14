import {
  getDashboardChatSessionKey,
  getEmbedChatSessionKey,
  readStoredSessionId,
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

describe('site-scoped embed session keys', () => {
  it('uses different keys per parent website', () => {
    expect(getEmbedChatSessionKey('proj-1', 'shop.example.com')).toBe(
      'chat_widget_session_proj-1_shop.example.com',
    );
    expect(getEmbedChatSessionKey('proj-1', 'help.example.com')).not.toBe(
      getEmbedChatSessionKey('proj-1', 'shop.example.com'),
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
