import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatbotConfigMobileMenu } from '@/features/chatbot-config/components/ChatbotConfigMobileMenu';
import { ChatbotConfigSettingsContent } from '@/features/chatbot-config/components/ChatbotConfigSettingsContent';
import { ChatbotConfigSettingsNav } from '@/features/chatbot-config/components/ChatbotConfigSettingsNav';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function SettingsPanel() {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { isCompact, showSettingsSidebar } = useChatbotConfigLayout();
  const { settingsSection } = useChatbotConfig();

  if (isCompact) {
    return (
      <View style={{ gap: spacing.md }} accessibilityLabel="Chatbot settings">
        <ChatbotConfigMobileMenu />
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
      accessibilityLabel="Chatbot settings">
      <View style={[styles.layout, { gap: spacing.lg }]}>
        {showSettingsSidebar ? <ChatbotConfigSettingsNav /> : null}
        <View style={[styles.content, { gap: spacing.md }]}>
          <ChatbotConfigSettingsContent section={settingsSection} />
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
