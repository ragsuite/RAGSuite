import { registerVoiceUi } from './modules/voice/frontend';

/**
 * CE-alone: register decorative voice chrome so Live Preview / admin hosts
 * reflect speech toggles. Overwritten when real EE `attachEnterpriseUi` runs.
 */
export function attachEnterpriseUi(): void {
  registerVoiceUi();
}
