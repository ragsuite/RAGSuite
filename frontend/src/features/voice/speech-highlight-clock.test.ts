import {
  createNativeWordClock,
  createPauseAwareElapsed,
  isUsableAudioDuration,
  nativeResumeNeedsRepair,
  remainingSpeechFromWord,
  speechSynthesisElapsedMs,
  wordIndexFromCharProgress,
} from './speech-highlight-clock';

describe('wordIndexFromCharProgress', () => {
  const longFirst = 'automation into x';

  it('stays on a long first word while equal-word math would already be on into', () => {
    // 40% of duration covers ~7 chars of "automation into x" (17 chars) → still "automation".
    expect(wordIndexFromCharProgress(4, 10, longFirst)).toBe(0);
    expect(Math.floor((4 / 10) * 3)).toBe(1);
  });

  it('stays on the same word when currentTime is unchanged after a wall-clock pause', () => {
    expect(wordIndexFromCharProgress(2.5, 10, longFirst)).toBe(
      wordIndexFromCharProgress(2.5, 10, longFirst),
    );
  });

  it('reaches the last word near the end of the audio', () => {
    expect(wordIndexFromCharProgress(9.9, 10, 'one two three four five six seven eight nine ten')).toBe(
      9,
    );
  });

  it('stays on word 0 until duration is usable', () => {
    expect(wordIndexFromCharProgress(1, Number.NaN, longFirst)).toBe(0);
    expect(wordIndexFromCharProgress(1, Number.POSITIVE_INFINITY, longFirst)).toBe(0);
    expect(isUsableAudioDuration(Number.NaN)).toBe(false);
    expect(isUsableAudioDuration(10)).toBe(true);
  });
});

describe('remainingSpeechFromWord', () => {
  it('slices from the last spoken word so native resume does not restart at 0', () => {
    expect(remainingSpeechFromWord('one two three four', 2)).toBe('three four');
    expect(remainingSpeechFromWord('one two three four', 0)).toBe('one two three four');
  });
});

describe('nativeResumeNeedsRepair', () => {
  it('is true only while speechSynthesis is still paused after resume', () => {
    expect(nativeResumeNeedsRepair({ paused: true })).toBe(true);
    expect(nativeResumeNeedsRepair({ paused: false })).toBe(false);
    expect(nativeResumeNeedsRepair(null)).toBe(false);
  });
});

describe('createPauseAwareElapsed', () => {
  it('does not count paused wall time', () => {
    const clock = createPauseAwareElapsed();
    clock.start(0);
    clock.pause(1000);
    expect(clock.elapsedMs(6000)).toBe(1000);
    clock.resume(6000);
    expect(clock.elapsedMs(6500)).toBe(1500);
  });

  it('freezes elapsed while paused', () => {
    const clock = createPauseAwareElapsed();
    clock.start(100);
    expect(clock.elapsedMs(400)).toBe(300);
    clock.pause(400);
    expect(clock.elapsedMs(4000)).toBe(300);
    expect(clock.isPaused()).toBe(true);
  });
});

describe('createNativeWordClock', () => {
  it('does not let a short WPM estimate race past the last boundary', () => {
    const clock = createNativeWordClock();
    clock.noteBoundary(3, 2000);
    // 1000ms estimate for 20 words would jump to ~word 8+ if the WPM timer kept running.
    expect(clock.tickLocal(5000, 1000, 20)).toBe(4);
    expect(clock.tickLocal(5000, 1000, 20)).not.toBeGreaterThan(4);
  });

  it('lets a later boundary win over the interpolator', () => {
    const clock = createNativeWordClock();
    clock.noteBoundary(3, 2000);
    expect(clock.tickLocal(2800, 1000, 20)).toBeLessThanOrEqual(4);
    clock.noteBoundary(4, 2800);
    expect(clock.lastBoundaryLocal()).toBe(4);
    expect(clock.tickLocal(2900, 1000, 20)).toBe(4);
  });

  it('treats spec elapsedTime as seconds and large values as milliseconds', () => {
    expect(speechSynthesisElapsedMs(1.5, 0)).toBe(1500);
    expect(speechSynthesisElapsedMs(1500, 0)).toBe(1500);
    expect(speechSynthesisElapsedMs(0, 400)).toBe(400);
  });

  it('uses pause-aware elapsed before any boundary', () => {
    const elapsed = createPauseAwareElapsed();
    const clock = createNativeWordClock();
    elapsed.start(0);
    elapsed.pause(200);
    elapsed.resume(5200);
    const running = elapsed.elapsedMs(5400);
    expect(running).toBe(400);
    expect(clock.hasBoundary()).toBe(false);
    expect(clock.tickLocal(running, 1000, 5)).toBe(clock.tickLocal(400, 1000, 5));
  });

  it('uses character progress before any boundary so long words are not skipped', () => {
    const clock = createNativeWordClock();
    const text = 'automation into x';
    expect(clock.tickLocal(4000, 10_000, 3, text)).toBe(0);
  });
});
