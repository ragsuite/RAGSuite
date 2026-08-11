import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatbotConfigTrainingMobileMenu } from '@/features/chatbot-config/components/ChatbotConfigTrainingMobileMenu';
import { ChatbotConfigTrainingNav } from '@/features/chatbot-config/components/ChatbotConfigTrainingNav';
import { TrainingActiveConfigPanel } from '@/features/chatbot-config/components/training/TrainingActiveConfigPanel';
import { TrainingChatHistoryPanel } from '@/features/chatbot-config/components/training/TrainingChatHistoryPanel';
import { TrainingOverviewPanel } from '@/features/chatbot-config/components/training/TrainingOverviewPanel';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function TrainingPanel() {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { isCompact, showSettingsSidebar } = useChatbotConfigLayout();
  const { trainingSubTab } = useChatbotConfig();

  if (isCompact) {
    return (
      <View style={{ gap: spacing.md }} accessibilityLabel={t('chatbot.training.title')}>
        <ChatbotConfigTrainingMobileMenu />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.workspace,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
      accessibilityLabel={t('chatbot.training.title')}>
      <View style={[styles.layout, { gap: spacing.lg }]}>
        {showSettingsSidebar ? <ChatbotConfigTrainingNav /> : null}
        <View style={[styles.content, { gap: spacing.md }]}>
          {trainingSubTab === 'overview' ? <TrainingOverviewPanel /> : null}
          {trainingSubTab === 'active-config' ? <TrainingActiveConfigPanel /> : null}
          {trainingSubTab === 'history' ? <TrainingChatHistoryPanel /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { borderWidth: 1 },
  layout: { flexDirection: 'row', alignItems: 'flex-start' },
  content: { flex: 1, minWidth: 0 },
});
