/** Whether an empty TTS queue should drop the highlight session. */
export function shouldClearHighlightOnQueueEmpty(retainSession: boolean): boolean {
  return !retainSession;
}

export type VoiceToggleAction = 'pause' | 'resume' | 'speak';
export type PausedTtsAction = 'resume' | 'replace' | 'none';

/** Next speak-button action from live speaking/paused flags (not stale React state). */
export function nextVoiceToggleAction(speaking: boolean, paused: boolean): VoiceToggleAction {
  if (speaking && !paused) return 'pause';
  if (speaking && paused) return 'resume';
  return 'speak';
}

/**
 * Auto-speak / speak() of a paused engine: resume only the same message.
 * A new contentKey (mic follow-up) must stop the paused clip and speak the new text.
 */
export function pausedTtsAction(opts: {
  paused: boolean;
  activeContentKey: string | null;
  requestedContentKey: string;
}): PausedTtsAction {
  if (!opts.paused) return 'none';
  const active = (opts.activeContentKey || '').trim();
  const requested = (opts.requestedContentKey || '').trim();
  if (active && requested && active === requested) return 'resume';
  return 'replace';
}

/** Configured provider TTS must not fall back to the browser voice. */
export function shouldFallbackToNativeTts(providerConfigured: boolean): boolean {
  return !providerConfigured;
}

/** Paused audio still owns the output session (mic barge-in / releaseSession). */
export function isTtsOutputLive(
  synthesis?: { speaking?: boolean; pending?: boolean; paused?: boolean } | null,
  providerBusy = false,
  providerPaused = false,
): boolean {
  return (
    providerBusy ||
    providerPaused ||
    isSpeechSynthesisBusy(synthesis) ||
    Boolean(synthesis?.paused)
  );
}

/** Cancel in-flight synthesis on append only when the engine is actually speaking. */
export function shouldCancelUtteranceOnAppend(synthesisSpeaking: boolean): boolean {
  return synthesisSpeaking;
}

/** True when the browser TTS engine still has live or queued utterances. */
export function isSpeechSynthesisBusy(
  synthesis?: { speaking?: boolean; pending?: boolean } | null,
): boolean {
  return Boolean(synthesis?.speaking || synthesis?.pending);
}

/** Browser synthesis or the RAGSuite TTS proxy player. */
export function isTtsEngineBusy(
  synthesis?: { speaking?: boolean; pending?: boolean } | null,
  providerBusy = false,
): boolean {
  return providerBusy || isSpeechSynthesisBusy(synthesis);
}

/** Pause icon only when audio is actually playing — not a leftover session. */
export function shouldMarkSpeakingOnBusyBail(playbackLive: boolean): boolean {
  return playbackLive;
}

/**
 * Stream just ended but an utterance is still in flight — defer finish.
 * Must not releaseSession / mark the turn finished (that clears highlight and
 * abandons any unread suffix).
 */
export function shouldDeferStreamingFinish(opts: {
  speechStarted: boolean;
  synthesisBusy: boolean;
  speaking: boolean;
}): boolean {
  if (!opts.speechStarted) return false;
  return opts.synthesisBusy || opts.speaking;
}

/**
 * Absolute visible-word index where the next spoken chunk begins.
 * Prefer an explicit offset from the committed spoken prefix; otherwise continue
 * after the live highlight cursor. Never use (fullCount - chunkCount) — that
 * assumes the chunk is the document suffix and breaks mid-stream.
 */
export function resolveVisibleWordOffset(opts: {
  explicit?: number | null;
  highlightIndex: number;
}): number {
  if (opts.explicit != null && Number.isFinite(opts.explicit) && opts.explicit >= 0) {
    return Math.floor(opts.explicit);
  }
  if (opts.highlightIndex >= 0) return opts.highlightIndex + 1;
  return 0;
}

/**
 * Continue the existing highlight session on streaming append / live store,
 * even when hook refs were reset (remount / idle gap).
 */
export function shouldContinueHighlightSession(opts: {
  append: boolean;
  storeActiveForKey: boolean;
  sameContentKey: boolean;
  highlightActive: boolean;
  synthesisSpeaking: boolean;
}): boolean {
  if (opts.append || opts.storeActiveForKey) return true;
  return shouldReuseHighlightSession({
    sameContentKey: opts.sameContentKey,
    highlightActive: opts.highlightActive,
    synthesisSpeaking: opts.synthesisSpeaking,
  });
}

/**
 * After stream finalize, only speak a true unread suffix when the new plain text
 * still starts with what was already committed. Divergent polish must not restart.
 * Empty spokenPrefix after speech already started is treated as diverged (do not
 * re-speak the full answer — that resets the highlighter to word 0).
 */
export function remainingSpeakTextAfterStream(
  fullPlain: string,
  spokenPrefix: string,
  options?: { speechStarted?: boolean },
): { remaining: string; diverged: boolean } {
  if (!spokenPrefix) {
    if (options?.speechStarted) {
      return { remaining: '', diverged: true };
    }
    return { remaining: fullPlain.trim(), diverged: false };
  }
  if (!fullPlain.startsWith(spokenPrefix)) {
    return { remaining: '', diverged: true };
  }
  return { remaining: fullPlain.slice(spokenPrefix.length).trim(), diverged: false };
}

/**
 * Keep the current highlight session when speech/highlight is already in flight.
 * Synthesis still speaking wins even after a remount (activeContentKey not yet bound).
 */
export function shouldReuseHighlightSession(opts: {
  sameContentKey: boolean;
  highlightActive: boolean;
  synthesisSpeaking: boolean;
}): boolean {
  if (opts.synthesisSpeaking) return true;
  return opts.sameContentKey && opts.highlightActive;
}
