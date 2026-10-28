import { fallbackLocalWordIndex } from './web-speech';

/** Lag so the painted word is the one already being heard, not the next one. */
export const PLAYHEAD_LAG_MS = 80;

export const NATIVE_RESUME_REPAIR_MS = 150;

/** True when HTMLAudioElement.duration can drive a playhead. */
export function isUsableAudioDuration(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0;
}

/** Character offsets of each spoken `\S+` token in TTS text. */
export function spokenWordStarts(text: string): number[] {
  return Array.from(text.matchAll(/\S+/g))
    .map((m) => m.index ?? -1)
    .filter((n) => n >= 0);
}

/**
 * Map audio playhead to a 0-based spoken-word index using character position.
 * TTS is roughly character-rate, so equal-sized word buckets race ahead of long tokens.
 */
export function wordIndexFromCharProgress(
  currentTimeSec: number,
  durationSec: number,
  text: string,
  lagMs = PLAYHEAD_LAG_MS,
): number {
  const starts = spokenWordStarts(text);
  if (starts.length === 0) return 0;
  if (!isUsableAudioDuration(durationSec)) return 0;
  const time = Number.isFinite(currentTimeSec) ? Math.max(0, currentTimeSec) : 0;
  const progress = Math.min(1, Math.max(0, time / durationSec));
  const lagFrac = Math.min(progress, Math.max(0, lagMs) / (durationSec * 1000));
  const charPos = Math.max(0, progress - lagFrac) * text.length;
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= charPos) index = i;
    else break;
  }
  return index;
}

/** Slice TTS text from the given spoken-word index through the end. */
export function remainingSpeechFromWord(text: string, localWordIndex: number): string {
  const starts = spokenWordStarts(text);
  if (starts.length === 0) return text;
  const clamped = Math.max(0, Math.min(localWordIndex, starts.length - 1));
  return text.slice(starts[clamped]);
}

/** Chrome pause/resume is often a no-op — still `paused` means the utterance is stuck. */
export function nativeResumeNeedsRepair(
  synthesis: { paused?: boolean } | null | undefined,
): boolean {
  return Boolean(synthesis?.paused);
}

export type PauseAwareElapsed = {
  start: (atMs?: number) => void;
  pause: (atMs?: number) => void;
  resume: (atMs?: number) => void;
  elapsedMs: (atMs?: number) => number;
  isPaused: () => boolean;
};

/** Elapsed time that freezes while paused so resume cannot jump the highlighter. */
export function createPauseAwareElapsed(): PauseAwareElapsed {
  let origin = 0;
  let pausedAccum = 0;
  let pausedAt: number | null = null;
  let started = false;

  return {
    start(atMs = Date.now()) {
      origin = atMs;
      pausedAccum = 0;
      pausedAt = null;
      started = true;
    },
    pause(atMs = Date.now()) {
      if (!started || pausedAt != null) return;
      pausedAt = atMs;
    },
    resume(atMs = Date.now()) {
      if (pausedAt == null) return;
      pausedAccum += Math.max(0, atMs - pausedAt);
      pausedAt = null;
    },
    elapsedMs(atMs = Date.now()) {
      if (!started) return 0;
      const end = pausedAt ?? atMs;
      return Math.max(0, end - origin - pausedAccum);
    },
    isPaused: () => pausedAt != null,
  };
}

export type NativeWordClock = {
  noteBoundary: (localIndex: number, elapsedMs: number) => void;
  hasBoundary: () => boolean;
  lastBoundaryLocal: () => number;
  /** Fallback tick. After a boundary, at most last+1 using measured pace — never a WPM race. */
  tickLocal: (
    elapsedMs: number,
    estimatedDurationMs: number,
    wordCount: number,
    text?: string,
  ) => number;
};

/**
 * SpeechSynthesisEvent.elapsedTime is seconds in the spec and milliseconds in
 * some engines. Values below 100 are treated as seconds.
 */
export function speechSynthesisElapsedMs(rawElapsed: number, fallbackMs: number): number {
  if (!Number.isFinite(rawElapsed) || rawElapsed <= 0) return Math.max(0, fallbackMs);
  return rawElapsed < 100 ? rawElapsed * 1000 : rawElapsed;
}

export function createNativeWordClock(): NativeWordClock {
  let lastLocal = -1;
  let lastElapsed = 0;
  let msPerWord = 0;

  return {
    noteBoundary(localIndex, elapsedMs) {
      lastLocal = Math.max(0, localIndex);
      lastElapsed = Math.max(0, elapsedMs);
      if (lastElapsed > 0 && lastLocal + 1 > 0) {
        msPerWord = lastElapsed / (lastLocal + 1);
      }
    },
    hasBoundary: () => lastLocal >= 0,
    lastBoundaryLocal: () => lastLocal,
    tickLocal(elapsedMs, estimatedDurationMs, wordCount, text) {
      if (wordCount <= 0) return 0;
      if (lastLocal < 0) {
        if (text) {
          return wordIndexFromCharProgress(
            elapsedMs / 1000,
            estimatedDurationMs / 1000,
            text,
          );
        }
        return fallbackLocalWordIndex(elapsedMs, estimatedDurationMs, wordCount);
      }
      const pace = msPerWord > 0 ? msPerWord : estimatedDurationMs / Math.max(1, wordCount);
      if (!(pace > 0)) return lastLocal;
      const extra = Math.max(0, elapsedMs - lastElapsed);
      const local = extra >= pace ? lastLocal + 1 : lastLocal;
      return Math.min(wordCount - 1, local);
    },
  };
}
