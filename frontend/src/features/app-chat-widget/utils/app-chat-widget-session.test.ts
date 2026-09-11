import {
  getDashboardChatSessionKey,
  getEmbedChatSessionKey,
  readStoredSessionId,
  writeSharedChatSessionId,
} from '@/features/app-chat-widget/utils/app-chat-widget-session';

describe('writeSharedChatSessionId', () => {
  it('writes the same session id to dashboard and embed keys', () => {
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
