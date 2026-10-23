import { estimateUtteranceDurationMs, fallbackLocalWordIndex, clampFallbackWordAdvance } from './web-speech';
import { fetchWidgetTtsAudio, type WidgetSpeechSurface } from './widget-speech-client';

const TICK_MS = 50;

type PlayOptions = {
  text: string;
  surface: WidgetSpeechSurface;
  language?: string | null;
  onStart: () => void;
  onWord: (localIndex: number, wordCount: number) => void;
  onEnd: () => void;
  onError: () => void;
};

let audioEl: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let tickTimer: number | null = null;
let playing = false;
let generation = 0;

export function isProviderTtsBusy(): boolean {
  return playing;
}

function clearTick(): void {
  if (typeof window === 'undefined') return;
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function resetEngine(): void {
  playing = false;
  releaseMedia();
}

function releaseMedia(): void {
  clearTick();
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    } catch {
      /* ignore */
    }
    audioEl = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export function stopProviderTts(): void {
  generation += 1;
  resetEngine();
}

export function pauseProviderTts(): void {
  try {
    audioEl?.pause();
  } catch {
    /* ignore */
  }
}

export function resumeProviderTts(): void {
  void audioEl?.play().catch(() => undefined);
}

export async function playProviderTts(options: PlayOptions): Promise<boolean> {
  generation += 1;
  const token = generation;
  resetEngine();
  const blob = await fetchWidgetTtsAudio(options.text, options.surface);
  if (token !== generation) return false;
  if (!blob || typeof window === 'undefined' || typeof Audio === 'undefined') {
    options.onError();
    return false;
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  objectUrl = url;
  audioEl = audio;
  const words = options.text.match(/\S+/g) ?? [];
  const wordCount = words.length;
  const durationMs = estimateUtteranceDurationMs(options.text, 1, options.language);
  let lastLocal = -1;
  let startedAt = 0;

  audio.onplay = () => {
    if (token !== generation) return;
    playing = true;
    startedAt = Date.now();
    options.onStart();
    if (wordCount <= 0) return;
    options.onWord(0, wordCount);
    clearTick();
    tickTimer = window.setInterval(() => {
      if (token !== generation || !playing) {
        clearTick();
        return;
      }
      if (audio.paused) return;
      const elapsed = Date.now() - startedAt;
      const target = fallbackLocalWordIndex(elapsed, durationMs, wordCount);
      const local = clampFallbackWordAdvance(target, lastLocal);
      if (local === lastLocal) return;
      lastLocal = local;
      options.onWord(local, wordCount);
    }, TICK_MS);
  };

  audio.onended = () => {
    if (token !== generation) return;
    playing = false;
    clearTick();
    if (wordCount > 0) options.onWord(wordCount - 1, wordCount);
    resetEngine();
    options.onEnd();
  };

  audio.onerror = () => {
    if (token !== generation) return;
    resetEngine();
    options.onError();
  };

  try {
    await audio.play();
    return true;
  } catch {
    if (token !== generation) return false;
    resetEngine();
    options.onError();
    return false;
  }
}
