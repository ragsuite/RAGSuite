/** Whether an empty TTS queue should drop the highlight session. */
export function shouldClearHighlightOnQueueEmpty(retainSession: boolean): boolean {
  return !retainSession;
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
