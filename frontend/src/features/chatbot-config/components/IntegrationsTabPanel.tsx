import React from 'react';
import { View } from 'react-native';

import { IntegrationsScriptsPanel } from '@/features/chatbot-config/components/settings/IntegrationsScriptsPanel';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function IntegrationsTabPanel() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  useChatbotConfigLayout();

  return (
    <View style={{ gap: spacing.md }} accessibilityLabel={t('chatbot.integrations.tabA11y')}>
      <IntegrationsScriptsPanel />
    </View>
  );
}
