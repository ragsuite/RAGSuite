import React from 'react';
import { StyleSheet, View } from 'react-native';

import { TrainingActiveConfigPanel } from '@/features/search-config/components/training/TrainingActiveConfigPanel';
import { TrainingOverviewPanel } from '@/features/search-config/components/training/TrainingOverviewPanel';
import { TrainingSearchHistoryPanel } from '@/features/search-config/components/training/TrainingSearchHistoryPanel';
import { SearchConfigSkeleton } from '@/features/search-config/components/SearchConfigSkeleton';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { TrainingSubTab } from '@/features/search-config/types/search-config.types';
import { SEARCH_CONFIG_DETAIL_BOTTOM_PADDING } from '@/features/search-config/utils/search-config-mobile';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type Props = {
  panel: TrainingSubTab;
  historyLayout?: 'list' | 'detail';
  sessionId?: string;
};

export function SearchConfigTrainingDetailScreen({
  panel,
  historyLayout = 'list',
  sessionId,
}: Props) {
  const { colors, spacing } = useAppTheme();
  const { loading, refreshing, error, feedback, refresh, clearFeedback } = useSearchConfig();

  const body =
    panel === 'overview' ? (
      <TrainingOverviewPanel />
    ) : panel === 'active-config' ? (
      <TrainingActiveConfigPanel />
    ) : (
      <TrainingSearchHistoryPanel layout={historyLayout} sessionId={sessionId} />
    );

  return (
    <View style={styles.root}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        horizontalPadding={spacing.sm}
        topPadding={spacing.xs}
        bottomPaddingExtra={SEARCH_CONFIG_DETAIL_BOTTOM_PADDING}
        stickyHeader={false}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentStyle={{ gap: spacing.md, flexGrow: historyLayout === 'detail' ? 1 : undefined }}>
        {loading ? (
          <SearchConfigSkeleton variant="detail" />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
});
