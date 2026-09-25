import {
  buildVoicePilotTurnHistory,
  resolveSpeechEndTranscript,
  shouldProcessRecognizerEnd,
  shouldRestartVoicePilotListen,
} from '@/features/app-chat-widget/utils/chatbot-voice-pilot-stt';

describe('resolveSpeechEndTranscript', () => {
  it('prefers final over interim', () => {
    expect(resolveSpeechEndTranscript('hello world', 'hel')).toBe('hello world');
  });

  it('falls back to interim when final is empty (browser interim-only onend)', () => {
    expect(resolveSpeechEndTranscript('', 'what is the refund policy')).toBe(
      'what is the refund policy',
    );
    expect(resolveSpeechEndTranscript(null, '  spoken only  ')).toBe('spoken only');
  });

  it('returns empty when both are blank', () => {
    expect(resolveSpeechEndTranscript('', '')).toBe('');
    expect(resolveSpeechEndTranscript(undefined, undefined)).toBe('');
  });
});

describe('shouldRestartVoicePilotListen', () => {
  it('restarts only while agent is active in listening or idle', () => {
    expect(shouldRestartVoicePilotListen(true, 'listening')).toBe(true);
    expect(shouldRestartVoicePilotListen(true, 'idle')).toBe(true);
  });

  it('does not restart during thinking or speaking (protects TTS)', () => {
    expect(shouldRestartVoicePilotListen(true, 'thinking')).toBe(false);
    expect(shouldRestartVoicePilotListen(true, 'speaking')).toBe(false);
    expect(shouldRestartVoicePilotListen(true, 'connecting')).toBe(false);
  });

  it('does not restart when agent is inactive', () => {
    expect(shouldRestartVoicePilotListen(false, 'listening')).toBe(false);
  });
});

describe('shouldProcessRecognizerEnd', () => {
  it('processes only when listen generation still matches', () => {
    expect(shouldProcessRecognizerEnd({ listenGen: 3, currentGen: 3 })).toBe(true);
  });

  it('ignores stale ends after intentional abort (typed submit / turn start)', () => {
    expect(shouldProcessRecognizerEnd({ listenGen: 3, currentGen: 4 })).toBe(false);
  });
});

describe('buildVoicePilotTurnHistory', () => {
  it('passes prior history to stream without duplicating the current user turn', () => {
    const prior = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'answer one' },
    ];
    const { historyBefore, nextHistory } = buildVoicePilotTurnHistory(
      prior,
      'second question',
      8,
    );
    expect(historyBefore).toEqual(prior);
    expect(historyBefore.some((m) => m.content === 'second question')).toBe(false);
    expect(nextHistory).toEqual([
      ...prior,
      { role: 'user', content: 'second question' },
    ]);
  });

  it('slices to maxMessages', () => {
    const prior = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ];
    const { nextHistory } = buildVoicePilotTurnHistory(prior, 'd', 2);
    expect(nextHistory).toEqual([
      { role: 'user', content: 'c' },
      { role: 'user', content: 'd' },
    ]);
  });
});

describe('Home dual CTA + Voice Pilot surface chrome gates', () => {
  function showHomeVoicePilotCta(opts: {
    showVoicePilotTab: boolean;
    hasOnPress: boolean;
  }): boolean {
    return Boolean(opts.showVoicePilotTab && opts.hasOnPress);
  }

  function showFooterTabBar(opts: {
    isTabbed: boolean;
    messagesView: 'list' | 'thread';
    isVoicePilotSurface: boolean;
  }): boolean {
    return opts.isTabbed && opts.messagesView !== 'thread' && !opts.isVoicePilotSurface;
  }

  it('shows dual Home CTA when Voice Pilot tab gate is on', () => {
    expect(
      showHomeVoicePilotCta({ showVoicePilotTab: true, hasOnPress: true }),
    ).toBe(true);
  });

  it('hides Voice Pilot Home CTA when tab gate is off', () => {
    expect(
      showHomeVoicePilotCta({ showVoicePilotTab: false, hasOnPress: true }),
    ).toBe(false);
  });

  it('keeps footer tabs on Home / Messages list', () => {
    expect(
      showFooterTabBar({
        isTabbed: true,
        messagesView: 'list',
        isVoicePilotSurface: false,
      }),
    ).toBe(true);
  });

  it('hides footer tabs on Voice Pilot surface', () => {
    expect(
      showFooterTabBar({
        isTabbed: true,
        messagesView: 'list',
        isVoicePilotSurface: true,
      }),
    ).toBe(false);
  });

  it('Voice Pilot header menu is pop-out only', () => {
    function menuItems(popOutOnly: boolean): string[] {
      const items: string[] = [];
      if (!popOutOnly) {
        items.push('language', 'translate', 'email', 'endSession');
      }
      items.push('popOut');
      return items;
    }
    expect(menuItems(true)).toEqual(['popOut']);
    expect(menuItems(false)).toContain('language');
    expect(menuItems(false)).toContain('popOut');
  });
});
