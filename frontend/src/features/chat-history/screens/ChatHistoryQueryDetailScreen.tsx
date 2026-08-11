import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatHistoryQueryDetailContent } from '@/features/chat-history/components/ChatHistoryQueryDetailContent';
import { useChatQueryDetail } from '@/features/chat-history/hooks/useChatQueryDetail';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  messageId: string;
};

export function ChatHistoryQueryDetailScreen({ messageId }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useStableToast();
  const { detail, loading, error, reload } = useChatQueryDetail(messageId);

  const onNotify = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      toast({ description: message, variant: type });
    },
    [toast],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        horizontalPadding={spacing.sm}
        topPadding={spacing.sm}
        bottomPaddingExtra={insets.bottom + spacing.lg}
        stickyHeader={false}
        contentStyle={{ gap: spacing.md }}>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
          Runtime snapshot captured with this answer.
        </Text>
        <StatePanel loading={loading && !detail} error={error} onRetry={() => void reload()}>
          {detail ? <ChatHistoryQueryDetailContent detail={detail} onNotify={onNotify} /> : null}
        </StatePanel>
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
