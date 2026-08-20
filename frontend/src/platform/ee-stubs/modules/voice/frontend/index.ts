import React from 'react';

import type { VoiceInputSlotProps, VoiceOutputSlotProps } from '@/platform/extension-slots';

/** CE stub — no microphone. Real control lives in EE `voice`. */
export function VoiceInputControl(_props: VoiceInputSlotProps) {
  return null;
}

/** CE stub — no speaker. Real control lives in EE `voice`. */
export function VoiceOutputControl(_props: VoiceOutputSlotProps) {
  return null;
}

export function registerVoiceUi(): void {
  /* no-op — CE does not fill composer slots */
}

export default registerVoiceUi;
