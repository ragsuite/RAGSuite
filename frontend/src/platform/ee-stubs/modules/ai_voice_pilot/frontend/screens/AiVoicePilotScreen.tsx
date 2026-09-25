import React from 'react';

import { EnterpriseLockedPreview, VoicePilotMock } from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** CE locked teaser — full Voice Pilot UI lives in EE `ai_voice_pilot`. */
export function AiVoicePilotScreen() {
  const { t } = useTranslation();
  return (
    <EnterpriseLockedPreview
      featureName={t('enterprise.locked.features.aiVoicePilot', { defaultValue: 'AI Voice Pilot' })}
      message={t('enterprise.locked.messages.aiVoicePilot', {
        defaultValue:
          'Voice-to-voice knowledge answers with selectable ElevenLabs voices are available in RAGSuite Enterprise.',
      })}>
      <VoicePilotMock />
    </EnterpriseLockedPreview>
  );
}
