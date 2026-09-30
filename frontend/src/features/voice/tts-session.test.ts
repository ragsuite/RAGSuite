import {
  isSpeechSynthesisBusy,
  remainingSpeakTextAfterStream,
  resolveVisibleWordOffset,
  shouldCancelUtteranceOnAppend,
  shouldClearHighlightOnQueueEmpty,
  shouldContinueHighlightSession,
  shouldDeferStreamingFinish,
  shouldReuseHighlightSession,
} from './tts-session';

describe('tts-session', () => {
  it('retains highlight when retainSession is true', () => {
    expect(shouldClearHighlightOnQueueEmpty(true)).toBe(false);
  });

  it('clears highlight when retainSession is false', () => {
    expect(shouldClearHighlightOnQueueEmpty(false)).toBe(true);
  });

  it('cancels in-flight utterance only while synthesis is speaking', () => {
    expect(shouldCancelUtteranceOnAppend(true)).toBe(true);
    expect(shouldCancelUtteranceOnAppend(false)).toBe(false);
  });

  it('detects busy synthesis from speaking or pending', () => {
    expect(isSpeechSynthesisBusy({ speaking: true, pending: false })).toBe(true);
    expect(isSpeechSynthesisBusy({ speaking: false, pending: true })).toBe(true);
    expect(isSpeechSynthesisBusy({ speaking: false, pending: false })).toBe(false);
    expect(isSpeechSynthesisBusy(null)).toBe(false);
  });

  it('defers streaming finish while speech started and engine/react still busy', () => {
    expect(
      shouldDeferStreamingFinish({
        speechStarted: true,
        synthesisBusy: true,
        speaking: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferStreamingFinish({
        speechStarted: true,
        synthesisBusy: false,
        speaking: true,
      }),
    ).toBe(true);
    expect(
      shouldDeferStreamingFinish({
        speechStarted: true,
        synthesisBusy: false,
        speaking: false,
      }),
    ).toBe(false);
    expect(
      shouldDeferStreamingFinish({
        speechStarted: false,
        synthesisBusy: true,
        speaking: true,
      }),
    ).toBe(false);
  });

  it('prefers explicit spoken-prefix offset over highlight cursor', () => {
    expect(resolveVisibleWordOffset({ explicit: 12, highlightIndex: 4 })).toBe(12);
    expect(resolveVisibleWordOffset({ explicit: 0, highlightIndex: 4 })).toBe(0);
  });

  it('continues after live highlight when explicit offset is absent', () => {
    expect(resolveVisibleWordOffset({ highlightIndex: 4 })).toBe(5);
    expect(resolveVisibleWordOffset({ explicit: null, highlightIndex: -1 })).toBe(0);
  });

  it('continues highlight on append even when hook refs were reset', () => {
    expect(
      shouldContinueHighlightSession({
        append: true,
        storeActiveForKey: false,
        sameContentKey: false,
        highlightActive: false,
        synthesisSpeaking: false,
      }),
    ).toBe(true);
    expect(
      shouldContinueHighlightSession({
        append: false,
        storeActiveForKey: true,
        sameContentKey: false,
        highlightActive: false,
        synthesisSpeaking: false,
      }),
    ).toBe(true);
    expect(
      shouldContinueHighlightSession({
        append: false,
        storeActiveForKey: false,
        sameContentKey: false,
        highlightActive: false,
        synthesisSpeaking: false,
      }),
    ).toBe(false);
  });

  it('speaks only the unread suffix when plain text grows with the same prefix', () => {
    expect(remainingSpeakTextAfterStream('Hello world ready.', 'Hello world')).toEqual({
      remaining: 'ready.',
      diverged: false,
    });
  });

  it('does not restart when final polish diverges from spoken prefix', () => {
    expect(remainingSpeakTextAfterStream('Hello there ready.', 'Hello world')).toEqual({
      remaining: '',
      diverged: true,
    });
  });

  it('treats empty prefix after speech started as diverged (no full restart)', () => {
    expect(
      remainingSpeakTextAfterStream('Hello world ready.', '', { speechStarted: true }),
    ).toEqual({ remaining: '', diverged: true });
  });

  it('reuses highlight session when the same content is already speaking', () => {
    expect(
      shouldReuseHighlightSession({
        sameContentKey: true,
        highlightActive: true,
        synthesisSpeaking: false,
      }),
    ).toBe(true);
    expect(
      shouldReuseHighlightSession({
        sameContentKey: true,
        highlightActive: false,
        synthesisSpeaking: true,
      }),
    ).toBe(true);
    // Remount while audio is live — content key not bound yet on the new hook.
    expect(
      shouldReuseHighlightSession({
        sameContentKey: false,
        highlightActive: false,
        synthesisSpeaking: true,
      }),
    ).toBe(true);
    expect(
      shouldReuseHighlightSession({
        sameContentKey: false,
        highlightActive: true,
        synthesisSpeaking: false,
      }),
    ).toBe(false);
  });
});
