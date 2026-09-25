export type {
  VoicePilotPrimaryTab,
  VoicePilotSettingsSection,
  VoicePilotSessionState,
  VoicePilotSettings,
  VoicePilotSettingsUpdate,
  VoicePilotVoice,
  VoicePilotVoiceConfig,
  VoicePilotTurnResponse,
} from '../types/voice-pilot.types';

export {
  VOICE_CONFIG_DEFAULTS,
  normalizeVoiceConfig,
  voiceConfigsEqual,
} from '../types/voice-pilot.types';

export async function getVoicePilotSettings(_projectId: string): Promise<never> {
  throw new Error('AI Voice Pilot requires RAGSuite Enterprise');
}

export async function putVoicePilotSettings(
  _projectId: string,
  _payload: unknown,
): Promise<never> {
  throw new Error('AI Voice Pilot requires RAGSuite Enterprise');
}
