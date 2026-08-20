export type SpeechHighlightState = {
  contentKey: string;
  /** Zero-based index into the visible plain-text word stream. */
  wordIndex: number;
  wordCount: number;
} | null;

type Listener = (state: SpeechHighlightState) => void;

let state: SpeechHighlightState = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener(state));
}

export function getSpeechHighlightState(): SpeechHighlightState {
  return state;
}

export function subscribeSpeechHighlight(listener: Listener): () => void {
  listeners.add(listener);
  // Do not call listener here — useSyncExternalStore reads getSnapshot itself.
  // Synchronous notify-on-subscribe can blank/crash dependent UI panels.
  return () => {
    listeners.delete(listener);
  };
}

export function startSpeechHighlightSession(contentKey: string, wordCount: number): void {
  if (!contentKey || wordCount <= 0) {
    state = null;
    emit();
    return;
  }
  state = { contentKey, wordIndex: -1, wordCount };
  emit();
}

export function updateSpeechHighlightWordCount(contentKey: string, wordCount: number): void {
  if (!state || state.contentKey !== contentKey) return;
  const nextCount = Math.max(0, wordCount);
  if (nextCount <= state.wordCount) return;
  const clampedIndex = Math.min(state.wordIndex, nextCount - 1);
  state = { ...state, wordCount: nextCount, wordIndex: clampedIndex };
  emit();
}

export function setSpeechHighlightWord(contentKey: string, wordIndex: number): void {
  if (!state || state.contentKey !== contentKey) return;
  const clamped = Math.max(-1, Math.min(wordIndex, state.wordCount - 1));
  if (state.wordIndex === clamped) return;
  state = { ...state, wordIndex: clamped };
  emit();
}

export function clearSpeechHighlight(contentKey?: string): void {
  if (contentKey && state?.contentKey !== contentKey) return;
  if (!state) return;
  state = null;
  emit();
}
