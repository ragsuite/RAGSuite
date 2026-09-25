import { registerVoiceUi } from './modules/voice/frontend';
import { registerVoicePilotUi } from './modules/ai_voice_pilot/frontend';

/**
 * CE-alone: register decorative voice chrome so Live Preview / admin hosts
 * reflect speech toggles. Overwritten when real EE `attachEnterpriseUi` runs.
 * Voice Pilot tab stays unregistered (hidden in CE).
 */
export function attachEnterpriseUi(): void {
  registerVoiceUi();
  registerVoicePilotUi();
}
