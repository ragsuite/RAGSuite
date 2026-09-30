/**
 * Pure helpers for voice utterance commit decisions (unit-tested without DOM SpeechRecognition).
 */

export function shouldCommitVoiceUtterance(options: {
  skipCommit: boolean;
  heardSpeech: boolean;
  transcript: string;
}): boolean {
  if (options.skipCommit) return false;
  if (!options.heardSpeech) return false;
  return Boolean(options.transcript.trim());
}
