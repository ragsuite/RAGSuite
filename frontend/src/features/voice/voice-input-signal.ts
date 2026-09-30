/**
 * Lightweight flag so the output control knows the last user message
 * was spoken (and should auto-play TTS) vs typed (manual speaker click).
 *
 * Lifecycle: mark on mic transcript → take once when TTS arms → clear.
 * Remounts may restore intent (with optional spoken offset) on unmount.
 */
let pendingAutoSpeak = false;
let pendingSpokenLen = 0;

export type PendingAutoSpeak = {
  pending: boolean;
  spokenLen: number;
};

export function markLastInputAsVoice(): void {
  pendingAutoSpeak = true;
  pendingSpokenLen = 0;
}

/** Restore auto-speak intent for a remounted control (e.g. Chat final message). */
export function restorePendingAutoSpeak(spokenLen = 0): void {
  pendingAutoSpeak = true;
  pendingSpokenLen = Math.max(0, spokenLen);
}

/** Read-and-clear pending auto-speak intent (once per user turn). */
export function takePendingAutoSpeak(): PendingAutoSpeak {
  const pending = pendingAutoSpeak;
  const spokenLen = pendingSpokenLen;
  pendingAutoSpeak = false;
  pendingSpokenLen = 0;
  return { pending, spokenLen };
}

/**
 * Arm auto-speak for a VoiceOutputControl turn.
 * Returns null when already armed so contentKey remaps do not re-take
 * (which would clear wasVoice after the first consume).
 */
export function armAutoSpeakForTurn(alreadyArmed: boolean): PendingAutoSpeak | null {
  if (alreadyArmed) return null;
  const taken = takePendingAutoSpeak();
  // Empty take is not a new turn — do not re-arm after finishStreamingSpeak.
  if (!taken.pending && taken.spokenLen <= 0) return null;
  return taken;
}

/** @deprecated Prefer takePendingAutoSpeak — kept for call-site compatibility. */
export function consumeVoiceInputFlag(): boolean {
  return takePendingAutoSpeak().pending;
}

export function peekPendingAutoSpeak(): boolean {
  return pendingAutoSpeak;
}

/** Test helper — resets module state between cases. */
export function resetVoiceInputSignalForTests(): void {
  pendingAutoSpeak = false;
  pendingSpokenLen = 0;
}
