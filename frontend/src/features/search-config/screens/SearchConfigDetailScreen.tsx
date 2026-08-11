import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SearchConfigSettingsContent } from '@/features/search-config/components/SearchConfigSettingsContent';
import { SearchConfigSkeleton } from '@/features/search-config/components/SearchConfigSkeleton';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SettingsSection } from '@/features/search-config/types/search-config.types';
import { SEARCH_CONFIG_DETAIL_BOTTOM_PADDING } from '@/features/search-config/utils/search-config-mobile';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type Props = {
  section: SettingsSection;
};

function SearchConfigDetailContent({ section }: Props) {
  const { colors, spacing } = useAppTheme();
  const { loading, refreshing, error, feedback, refresh, clearFeedback } = useSearchConfig();

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
        contentStyle={{ gap: spacing.md }}>
        {loading ? (
          <SearchConfigSkeleton variant="detail" />
        ) : (
          <StatePanel error={error} onRetry={() => void refresh()}>
            <SearchConfigSettingsContent section={section} />
          </StatePanel>
        )}
      </FeatureScreenScroll>
      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

export function SearchConfigDetailScreen({ section }: Props) {
  return <SearchConfigDetailContent section={section} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
