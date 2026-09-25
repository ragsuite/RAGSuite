/**
 * Resolve the transcript to send when SpeechRecognition ends.
 * Many browsers fire onend with only interim results (never isFinal) —
 * prefer final, fall back to interim so turns still generate.
 */
export function resolveSpeechEndTranscript(
  finalText: string | null | undefined,
  interimText: string | null | undefined,
): string {
  const final = (finalText || '').trim();
  if (final) return final;
  return (interimText || '').trim();
}

/**
 * Whether the listening loop should restart after an empty recognition end.
 * Avoid restarting while thinking/speaking so TTS is not cut off.
 */
export function shouldRestartVoicePilotListen(
  agentActive: boolean,
  sessionState: string,
): boolean {
  if (!agentActive) return false;
  return sessionState === 'listening' || sessionState === 'idle';
}

/**
 * Gate recognizer onend / soft onerror after intentional abort (typed submit,
 * turn start, session end). Stale ends must not start a second turn.
 */
export function shouldProcessRecognizerEnd(opts: {
  listenGen: number;
  currentGen: number;
}): boolean {
  return opts.listenGen === opts.currentGen;
}

/**
 * Build turn history the way dashboard Pilot does: stream gets prior history
 * only; current user text is the query param (not duplicated in history).
 */
export function buildVoicePilotTurnHistory(
  prior: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  userText: string,
  maxMessages: number,
): {
  historyBefore: Array<{ role: 'user' | 'assistant'; content: string }>;
  nextHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const historyBefore = [...prior];
  const nextHistory = [
    ...historyBefore,
    { role: 'user' as const, content: userText },
  ].slice(-maxMessages);
  return { historyBefore, nextHistory };
}

/** Brief settle after TTS so STT does not fight speaker tail / echo. */
export const VOICE_PILOT_POST_SPEECH_SETTLE_MS = 200;
