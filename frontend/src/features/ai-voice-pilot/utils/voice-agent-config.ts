/**
 * Tunables for the continuous Pilot voice-agent loop.
 * Keep in one place — do not scatter magic numbers.
 *
 * Conversation state machine (sessionState + agentActive):
 *   idle → connecting → speaking(opening) → listening
 *   listening → thinking → speaking → listening …
 *   speaking + barge-in → listening
 *   listening + 5s silence → speaking(follow-up) → listening
 *   listening + 4s after follow-up → speaking(end) → idle
 */
export const VOICE_AGENT_CONFIG = {
  firstSilenceTimeoutMs: 5000,
  secondSilenceTimeoutMs: 4000,
  followUpMessage: 'Are you still there?',
  endMessage: "Okay, I'll be here if you need me.",
  /** Mic RMS above this (0–1) for bargeInHoldMs interrupts TTS. */
  bargeInRmsThreshold: 0.14,
  bargeInHoldMs: 280,
  /** Max chat turns sent with each RAG request. */
  maxChatHistoryMessages: 8,
  /** Delay before optional thinking filler TTS (RAG/LLM latency). */
  thinkingFillerDelayMs: 900,
  thinkingFillers: ['Hmm…', 'Let me check that.', 'Yeah, let me look into that.'] as const,
} as const;

export type VoiceAgentChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
