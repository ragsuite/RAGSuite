import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackDetailContent } from '@/features/feedback-moderation/components/FeedbackDetailContent';
import { useFeedbackDetail } from '@/features/feedback-moderation/hooks/useFeedbackDetail';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  feedbackId: string;
};

export function FeedbackDetailScreen({ feedbackId }: Props) {
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useStableToast();
  const { detail, loading, error, reload, setDetail } = useFeedbackDetail(feedbackId);

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
        topPadding={spacing.xs}
        bottomPaddingExtra={insets.bottom + spacing.xl}
        contentStyle={{ gap: spacing.sm }}>
        <StatePanel loading={loading && !detail} error={error} onRetry={() => void reload()}>
          {detail ? (
            <FeedbackDetailContent detail={detail} onDetailChange={setDetail} onNotify={onNotify} />
          ) : null}
        </StatePanel>
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
