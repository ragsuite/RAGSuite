import React from 'react';
import { StyleSheet, View } from 'react-native';

import { TrainingActiveConfigPanel } from '@/features/chatbot-config/components/training/TrainingActiveConfigPanel';
import { TrainingChatHistoryPanel } from '@/features/chatbot-config/components/training/TrainingChatHistoryPanel';
import { TrainingOverviewPanel } from '@/features/chatbot-config/components/training/TrainingOverviewPanel';
import { ChatbotConfigSkeleton } from '@/features/chatbot-config/components/ChatbotConfigSkeleton';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { TrainingSubTab } from '@/features/chatbot-config/types/chatbot-config.types';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { CHATBOT_CONFIG_DETAIL_BOTTOM_PADDING } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type Props = {
  panel: TrainingSubTab;
  historyLayout?: 'list' | 'detail';
  sessionId?: string;
};

function ChatbotConfigTrainingDetailContent({ panel, historyLayout = 'list', sessionId }: Props) {
  const { colors, spacing } = useAppTheme();
  const { loading, refreshing, error, feedback, refresh, clearFeedback } = useChatbotConfig();

  const body =
    panel === 'overview' ? (
      <TrainingOverviewPanel />
    ) : panel === 'active-config' ? (
      <TrainingActiveConfigPanel />
    ) : (
      <TrainingChatHistoryPanel layout={historyLayout} sessionId={sessionId} />
    );

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
        contentStyle={{
          gap: spacing.md,
          flexGrow: historyLayout === 'detail' ? 1 : undefined,
        }}>
        {loading ? (
          <ChatbotConfigSkeleton variant={panel === 'history' ? 'history-list' : 'detail'} />
        ) : (
          <StatePanel error={error} onRetry={() => void refresh()}>
            {body}
          </StatePanel>
        )}
      </FeatureScreenScroll>
      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

export function ChatbotConfigTrainingDetailScreen(props: Props) {
  return <ChatbotConfigTrainingDetailContent {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
