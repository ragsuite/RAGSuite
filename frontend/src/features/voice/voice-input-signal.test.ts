import {
  armAutoSpeakForTurn,
  markLastInputAsVoice,
  peekPendingAutoSpeak,
  resetVoiceInputSignalForTests,
  restorePendingAutoSpeak,
  takePendingAutoSpeak,
  consumeVoiceInputFlag,
} from './voice-input-signal';

describe('pending auto-speak flag', () => {
  beforeEach(() => {
    resetVoiceInputSignalForTests();
  });

  it('mark → take once true → take again false', () => {
    markLastInputAsVoice();
    expect(peekPendingAutoSpeak()).toBe(true);

    const first = takePendingAutoSpeak();
    expect(first).toEqual({ pending: true, spokenLen: 0 });
    expect(peekPendingAutoSpeak()).toBe(false);

    const second = takePendingAutoSpeak();
    expect(second).toEqual({ pending: false, spokenLen: 0 });
  });

  it('does not auto-speak when never marked (typed input)', () => {
    expect(takePendingAutoSpeak()).toEqual({ pending: false, spokenLen: 0 });
  });

  it('restore preserves spoken offset for remount finish', () => {
    restorePendingAutoSpeak(42);
    expect(peekPendingAutoSpeak()).toBe(true);
    expect(takePendingAutoSpeak()).toEqual({ pending: true, spokenLen: 42 });
    expect(takePendingAutoSpeak()).toEqual({ pending: false, spokenLen: 0 });
  });

  it('mark resets spoken offset', () => {
    restorePendingAutoSpeak(10);
    markLastInputAsVoice();
    expect(takePendingAutoSpeak()).toEqual({ pending: true, spokenLen: 0 });
  });

  it('consumeVoiceInputFlag aliases take().pending', () => {
    markLastInputAsVoice();
    expect(consumeVoiceInputFlag()).toBe(true);
    expect(consumeVoiceInputFlag()).toBe(false);
  });

  it('second contentKey while already armed does not re-take (keeps voice intent)', () => {
    markLastInputAsVoice();
    const first = armAutoSpeakForTurn(false);
    expect(first).toEqual({ pending: true, spokenLen: 0 });

    // Remap would wrongly call take again → false and clear wasVoice.
    // Already-armed path must skip take entirely.
    expect(armAutoSpeakForTurn(true)).toBeNull();
    expect(peekPendingAutoSpeak()).toBe(false);
  });

  it('does not re-arm after an empty take (stream finalize)', () => {
    expect(armAutoSpeakForTurn(false)).toBeNull();
  });
});
