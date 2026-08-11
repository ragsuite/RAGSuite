import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SearchConfigTrainingMobileMenu } from '@/features/search-config/components/SearchConfigTrainingMobileMenu';
import { SearchConfigTrainingNav } from '@/features/search-config/components/SearchConfigTrainingNav';
import { TrainingActiveConfigPanel } from '@/features/search-config/components/training/TrainingActiveConfigPanel';
import { TrainingOverviewPanel } from '@/features/search-config/components/training/TrainingOverviewPanel';
import { TrainingSearchHistoryPanel } from '@/features/search-config/components/training/TrainingSearchHistoryPanel';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function TrainingPanel() {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { isCompact, showSettingsSidebar } = useSearchConfigLayout();
  const { trainingSubTab } = useSearchConfig();

  if (isCompact) {
    return (
      <View style={{ gap: spacing.md }} accessibilityLabel="Training configuration">
        <SearchConfigTrainingMobileMenu />
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
      accessibilityLabel={t('search.training.title')}>
      <View style={[styles.layout, { gap: spacing.lg }]}>
        {showSettingsSidebar ? <SearchConfigTrainingNav /> : null}
        <View style={[styles.content, { gap: spacing.md }]}>
          {trainingSubTab === 'overview' ? <TrainingOverviewPanel /> : null}
          {trainingSubTab === 'active-config' ? <TrainingActiveConfigPanel /> : null}
          {trainingSubTab === 'history' ? <TrainingSearchHistoryPanel /> : null}
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
