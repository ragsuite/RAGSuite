import React from 'react';
import { View } from 'react-native';
import { AudioLines } from 'lucide-react-native';

import { AiVoicePilotScreen } from '@/features/ai-voice-pilot/screens/AiVoicePilotScreen';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Settings sidebar panel — same shell as Privacy / DPA (single SearchConfigPanelCard). */
export function VoicePilotSettingsPanel() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <SearchConfigPanelCard
      icon={AudioLines}
      title={t('chatbot.settings.voicePilot')}
      subtitle={t('chatbot.settings.voicePilot.subtitle')}
      style={{ overflow: 'visible' }}>
      <View style={{ gap: spacing.lg, overflow: 'visible' }}>
        <AiVoicePilotScreen embedded settingsShell />
      </View>
    </SearchConfigPanelCard>
  );
}
