import {
  isProviderTtsBusy,
  isProviderTtsPaused,
  pauseProviderTts,
  playProviderTts,
  primeProviderTtsPlayback,
  resetProviderTtsForTests,
  resumeProviderTts,
} from './provider-tts-player';

jest.mock('./widget-speech-client', () => ({
  fetchWidgetTtsAudio: jest.fn(async () => new Blob(['x'], { type: 'audio/mpeg' })),
}));

class FakeAudio {
  duration = 10;
  currentTime = 0;
  src = '';
  paused = true;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  ondurationchange: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  playShouldFail = false;
  stayPaused = false;

  play = jest.fn(async () => {
    if (this.playShouldFail) throw new Error('play failed');
    if (this.stayPaused) return;
    this.paused = false;
    this.onloadedmetadata?.();
    this.onplay?.();
  });

  pause = jest.fn(() => {
    this.paused = true;
  });

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  load(): void {}
}

describe('playProviderTts playhead', () => {
  const originalAudio = global.Audio;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let lastAudio: FakeAudio | null = null;

  beforeEach(() => {
    lastAudio = null;
    resetProviderTtsForTests();
    global.Audio = jest.fn(() => {
      lastAudio = new FakeAudio();
      return lastAudio;
    }) as unknown as typeof Audio;
    URL.createObjectURL = () => 'blob:fake';
    URL.revokeObjectURL = () => undefined;
    jest.useFakeTimers();
  });

  afterEach(() => {
    resetProviderTtsForTests();
    jest.useRealTimers();
    global.Audio = originalAudio;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('highlights from character playhead, not equal-sized words', async () => {
    const words: number[] = [];
    const accepted = await playProviderTts({
      text: 'automation into x',
      surface: 'chat',
      onStart: () => undefined,
      onWord: (local) => {
        words.push(local);
      },
      onEnd: () => undefined,
      onError: () => undefined,
    });
    expect(accepted).toBe(true);
    expect(lastAudio).toBeTruthy();

    lastAudio!.currentTime = 4;
    lastAudio!.ontimeupdate?.();
    expect(words.at(-1)).toBe(0);
    expect(Math.floor((4 / 10) * 3)).toBe(1);
  });

  it('does not advance while paused, then follows currentTime after resume', async () => {
    const words: number[] = [];
    await playProviderTts({
      text: 'one two three four five six seven eight nine ten',
      surface: 'chat',
      onStart: () => undefined,
      onWord: (local) => {
        words.push(local);
      },
      onEnd: () => undefined,
      onError: () => undefined,
    });

    lastAudio!.currentTime = 2.5;
    lastAudio!.ontimeupdate?.();
    const atPause = words.at(-1);
    pauseProviderTts();
    expect(isProviderTtsBusy()).toBe(false);
    expect(isProviderTtsPaused()).toBe(true);

    lastAudio!.currentTime = 8;
    jest.advanceTimersByTime(5000);
    lastAudio!.ontimeupdate?.();
    expect(words.at(-1)).toBe(atPause);

    lastAudio!.playShouldFail = false;
    const resumed = await resumeProviderTts();
    expect(resumed).toBe(true);
    expect(isProviderTtsPaused()).toBe(false);

    lastAudio!.currentTime = 9.9;
    lastAudio!.ontimeupdate?.();
    expect(words.at(-1)).toBe(9);
  });

  it('keeps paused state when resume play() fails', async () => {
    await playProviderTts({
      text: 'one two',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    pauseProviderTts();
    lastAudio!.playShouldFail = true;
    await expect(resumeProviderTts()).resolves.toBe(false);
    expect(isProviderTtsPaused()).toBe(true);
    expect(isProviderTtsBusy()).toBe(false);
  });

  it('is not busy until onplay fires', async () => {
    expect(isProviderTtsBusy()).toBe(false);
    const busyDuringPlay: boolean[] = [];
    global.Audio = jest.fn(() => {
      lastAudio = new FakeAudio();
      const inner = lastAudio;
      inner.play = jest.fn(async () => {
        busyDuringPlay.push(isProviderTtsBusy());
        inner.paused = false;
        inner.onloadedmetadata?.();
        inner.onplay?.();
        busyDuringPlay.push(isProviderTtsBusy());
      });
      return inner;
    }) as unknown as typeof Audio;

    const accepted = await playProviderTts({
      text: 'hello world',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    expect(accepted).toBe(true);
    expect(busyDuringPlay).toEqual([false, true]);
    expect(isProviderTtsBusy()).toBe(true);
  });

  it('treats play() that stays paused as failure and resets the engine', async () => {
    const onError = jest.fn();
    global.Audio = jest.fn(() => {
      lastAudio = new FakeAudio();
      lastAudio.stayPaused = true;
      return lastAudio;
    }) as unknown as typeof Audio;

    const accepted = await playProviderTts({
      text: 'hello world',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError,
    });
    expect(accepted).toBe(false);
    expect(isProviderTtsBusy()).toBe(false);
    expect(isProviderTtsPaused()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('replaces paused audio when a new clip starts', async () => {
    await playProviderTts({
      text: 'old answer one two three',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    const first = lastAudio;
    pauseProviderTts();
    expect(isProviderTtsPaused()).toBe(true);

    const accepted = await playProviderTts({
      text: 'new answer about location',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    expect(accepted).toBe(true);
    expect(lastAudio).toBe(first);
    expect(isProviderTtsPaused()).toBe(false);
    expect(isProviderTtsBusy()).toBe(true);
    expect(global.Audio).toHaveBeenCalledTimes(1);
  });

  it('reuses the primed audio element for auto-speak play', async () => {
    primeProviderTtsPlayback();
    expect(lastAudio).toBeTruthy();
    const primed = lastAudio;
    const accepted = await playProviderTts({
      text: 'hello world',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    expect(accepted).toBe(true);
    expect(lastAudio).toBe(primed);
    expect(global.Audio).toHaveBeenCalledTimes(1);
  });

  it('does not resume a paused session when priming', async () => {
    await playProviderTts({
      text: 'keep this paused',
      surface: 'chat',
      onStart: () => undefined,
      onWord: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
    pauseProviderTts();
    lastAudio!.play.mockClear();
    primeProviderTtsPlayback();
    expect(lastAudio!.play).not.toHaveBeenCalled();
    expect(isProviderTtsPaused()).toBe(true);
  });
});
