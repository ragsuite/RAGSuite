import {
  clearSpeechHighlight,
  getSpeechHighlightState,
  setSpeechHighlightWord,
  startSpeechHighlightSession,
  subscribeSpeechHighlight,
  updateSpeechHighlightWordCount,
} from '@/platform/speech-highlight/store';
import { countSpeechWords, tokenizeSpeechWords } from '@/platform/speech-highlight/tokenize';

describe('tokenizeSpeechWords', () => {
  it('counts sequential words in plain text', () => {
    expect(tokenizeSpeechWords('Hello world.')).toEqual([
      { index: 0, text: 'Hello', start: 0, end: 5 },
      { index: 1, text: 'world.', start: 6, end: 12 },
    ]);
    expect(countSpeechWords('One two three')).toBe(3);
  });
});

describe('speech highlight store', () => {
  afterEach(() => {
    clearSpeechHighlight();
  });

  it('tracks active word for a content key', () => {
    startSpeechHighlightSession('msg-1', 4);
    setSpeechHighlightWord('msg-1', 2);
    expect(getSpeechHighlightState()).toEqual({
      contentKey: 'msg-1',
      wordIndex: 2,
      wordCount: 4,
    });
  });

  it('ignores updates for a different content key', () => {
    startSpeechHighlightSession('msg-1', 3);
    setSpeechHighlightWord('msg-2', 1);
    expect(getSpeechHighlightState()?.wordIndex).toBe(-1);
  });

  it('clears highlight state', () => {
    startSpeechHighlightSession('msg-1', 2);
    clearSpeechHighlight('msg-1');
    expect(getSpeechHighlightState()).toBeNull();
  });

  it('subscribe does not synchronously notify (safe for useSyncExternalStore)', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSpeechHighlight(listener);
    expect(listener).not.toHaveBeenCalled();
    startSpeechHighlightSession('msg-1', 2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('grows wordCount on append without resetting the active word', () => {
    startSpeechHighlightSession('msg-1', 3);
    setSpeechHighlightWord('msg-1', 2);
    updateSpeechHighlightWordCount('msg-1', 8);
    expect(getSpeechHighlightState()).toEqual({
      contentKey: 'msg-1',
      wordIndex: 2,
      wordCount: 8,
    });
  });
});
