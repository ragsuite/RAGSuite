import React from 'react';
import { StyleSheet, View } from 'react-native';

import { IntegrationsTabPanel } from '@/features/chatbot-config/components/IntegrationsTabPanel';
import { ChatbotConfigSkeleton } from '@/features/chatbot-config/components/ChatbotConfigSkeleton';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { CHATBOT_CONFIG_DETAIL_BOTTOM_PADDING } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

function ChatbotConfigIntegrationsDetailContent() {
  const { colors, spacing } = useAppTheme();
  const { loading, refreshing, error, feedback, refresh, clearFeedback } = useChatbotConfig();

  return (
    <View style={styles.root}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        horizontalPadding={spacing.sm}
        topPadding={spacing.xs}
        bottomPaddingExtra={CHATBOT_CONFIG_DETAIL_BOTTOM_PADDING}
        stickyHeader={false}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentStyle={{ gap: spacing.md }}>
        {loading ? (
          <ChatbotConfigSkeleton variant="detail" />
        ) : (
          <StatePanel error={error} onRetry={() => void refresh()}>
            <IntegrationsTabPanel />
          </StatePanel>
        )}
      </FeatureScreenScroll>
      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

export function ChatbotConfigIntegrationsDetailScreen() {
  return <ChatbotConfigIntegrationsDetailContent />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
