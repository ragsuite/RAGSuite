import { isUsableAudioDuration, wordIndexFromCharProgress } from './speech-highlight-clock';
import { fetchWidgetTtsAudio, type WidgetSpeechSurface } from './widget-speech-client';

const TICK_MS = 50;
/** Tiny silent WAV so a mic/speaker click can unlock HTMLAudio before the TTS fetch. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

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
/** True after onplay until stop/end/error — stays true while paused so resume can continue. */
let sessionActive = false;
let generation = 0;

/** True only while audio is actually playing (not paused, not pre-play). */
export function isProviderTtsBusy(): boolean {
  return playing;
}

export function isProviderTtsPaused(): boolean {
  return sessionActive && Boolean(audioEl?.paused);
}

function clearTick(): void {
  if (typeof window === 'undefined') return;
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function resetEngine(keepElement = true): void {
  playing = false;
  sessionActive = false;
  releaseMedia(keepElement);
}

function detachAudioHandlers(audio: HTMLAudioElement): void {
  audio.onplay = null;
  audio.onended = null;
  audio.onerror = null;
  audio.onloadedmetadata = null;
  audio.ondurationchange = null;
  audio.ontimeupdate = null;
}

function releaseMedia(keepElement: boolean): void {
  clearTick();
  if (audioEl) {
    try {
      detachAudioHandlers(audioEl);
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    } catch {
      /* ignore */
    }
    if (!keepElement) audioEl = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function ensureAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

/** Unlock HTMLAudio on a user gesture so later auto-speak play() is allowed. */
export function primeProviderTtsPlayback(): void {
  if (sessionActive || playing) return;
  const audio = ensureAudioElement();
  if (!audio) return;
  try {
    if (!audio.src) audio.src = SILENT_WAV;
    const result = audio.play();
    if (result && typeof result.then === 'function') {
      void result
        .then(() => {
          if (sessionActive || playing) return;
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

function releaseStuckNativeSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function stopProviderTts(): void {
  generation += 1;
  resetEngine(true);
}

/** Test-only: drop the singleton element between cases. */
export function resetProviderTtsForTests(): void {
  generation += 1;
  resetEngine(false);
}

export function pauseProviderTts(): void {
  clearTick();
  playing = false;
  try {
    audioEl?.pause();
  } catch {
    /* ignore */
  }
}

export async function resumeProviderTts(): Promise<boolean> {
  if (!audioEl || !sessionActive) return false;
  if (!audioEl.paused && playing) return true;
  try {
    await audioEl.play();
    return playing && !audioEl.paused;
  } catch {
    return false;
  }
}

function emitPlayhead(
  audio: HTMLAudioElement,
  text: string,
  onWord: PlayOptions['onWord'],
  lastLocal: { current: number },
): void {
  if (audio.paused) return;
  const wordCount = spokenWordCount(text);
  if (wordCount <= 0) return;
  if (!isUsableAudioDuration(audio.duration)) return;
  const local = wordIndexFromCharProgress(audio.currentTime, audio.duration, text);
  if (local === lastLocal.current) return;
  lastLocal.current = local;
  onWord(local, wordCount);
}

function spokenWordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

export async function playProviderTts(options: PlayOptions): Promise<boolean> {
  generation += 1;
  const token = generation;
  resetEngine(true);
  releaseStuckNativeSpeech();
  const blob = await fetchWidgetTtsAudio(options.text, options.surface);
  if (token !== generation) return false;
  if (!blob || typeof window === 'undefined' || typeof Audio === 'undefined') {
    return false;
  }

  const url = URL.createObjectURL(blob);
  const audio = ensureAudioElement();
  if (!audio) {
    URL.revokeObjectURL(url);
    return false;
  }
  objectUrl = url;
  audio.src = url;
  const text = options.text;
  const wordCount = spokenWordCount(text);
  const lastLocal = { current: -1 };

  const sync = () => {
    if (token !== generation) return;
    emitPlayhead(audio, text, options.onWord, lastLocal);
  };

  const startTicks = () => {
    clearTick();
    tickTimer = window.setInterval(() => {
      if (token !== generation || !playing || audio.paused) {
        if (token !== generation) clearTick();
        return;
      }
      sync();
    }, TICK_MS);
  };

  audio.onloadedmetadata = sync;
  audio.ondurationchange = sync;
  audio.ontimeupdate = sync;

  audio.onplay = () => {
    if (token !== generation) return;
    playing = true;
    sessionActive = true;
    options.onStart();
    if (wordCount > 0 && lastLocal.current < 0) {
      options.onWord(0, wordCount);
      lastLocal.current = 0;
    }
    sync();
    startTicks();
  };

  audio.onended = () => {
    if (token !== generation) return;
    playing = false;
    sessionActive = false;
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
    if (token !== generation) return false;
    if (audio.paused || !playing) {
      resetEngine();
      options.onError();
      return false;
    }
    return true;
  } catch {
    if (token !== generation) return false;
    resetEngine();
    options.onError();
    return false;
  }
}
