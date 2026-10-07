import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { ProviderConfigPanel } from '@/features/model-configuration/components/ProviderConfigPanel';
import { PROVIDER_MARKS } from '@/features/model-configuration/components/provider-marks';
import { useModelConfiguration } from '@/features/model-configuration/hooks/useModelConfiguration';
import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { StatusBadge } from '@/shared/components/status-badge';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';

const PROVIDER_TAB_ICON_SIZE = 18;

export function ModelConfigurationScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const { isWeb, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const controller = useModelConfiguration();
  const { bundle, loading, error, hasProject } = controller;
  const [activeProvider, setActiveProvider] = useState<ModelProviderKey>('openai');

  const providers = useMemo(() => bundle?.providers ?? [], [bundle]);
  const tabs = useMemo(
    () =>
      providers.map((entry) => ({
        key: entry.key,
        label: entry.label,
        icon: PROVIDER_MARKS[entry.key],
        iconSize: PROVIDER_TAB_ICON_SIZE,
        trailingIcon: entry.config.configured ? CheckCircle2 : undefined,
        accessibilityLabel: entry.config.configured
          ? `${entry.label}, ${t('modelConfiguration.status.configured')}`
          : entry.label,
      })),
    [providers, t],
  );

  useEffect(() => {
    if (providers.length > 0 && !providers.some((p) => p.key === activeProvider)) {
      setActiveProvider(providers[0].key);
    }
  }, [providers, activeProvider]);

  const activeEntry = providers.find((p) => p.key === activeProvider) ?? providers[0];
  const configuredCount = bundle?.configuredCount ?? 0;

  const header = (
    <View style={[styles.headerStack, { gap: spacing.xs }]}>
      <PageSectionHeader
        title={t('modelConfiguration.title')}
        subtitle={t('modelConfiguration.subtitle')}
        titleAddon={
          bundle ? (
            <StatusBadge
              size="compact"
              tone={configuredCount > 0 ? 'success' : 'muted'}
              label={t('modelConfiguration.configuredCount', {
                count: configuredCount,
                total: providers.length,
              })}
              preserveCase
            />
          ) : null
        }
      />
      {tabs.length > 0 ? (
        <CrawlSegmentTabs
          tabs={tabs}
          activeTab={activeEntry?.key ?? tabs[0].key}
          onChange={setActiveProvider}
          variant="primary"
          appearance="pill"
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={horizontalPadding ?? spacing.sm}
        topPadding={isWeb ? spacing.md + spacing.xs : spacing.sm}
        bottomPaddingExtra={Platform.OS === 'web' ? 0 : 56}
        stickyHeaderDivider
        stickyHeaderBottomPadding={spacing.xs}
        stickyContentTopPadding={spacing.sm}
        header={header}>
        <StatePanel
          loading={loading && !bundle}
          error={error}
          onRetry={() => void controller.reload()}
          isEmpty={!hasProject || providers.length === 0}
          emptyLabel={hasProject ? t('modelConfiguration.empty') : t('modelConfiguration.noProject')}>
          {activeEntry ? (
            <ProviderConfigPanel
              key={activeEntry.key}
              entry={activeEntry}
              saving={controller.savingProvider === activeEntry.key}
              removing={controller.removingProvider === activeEntry.key}
              onSave={controller.saveProvider}
              onTest={controller.testProvider}
              onRemove={controller.removeProvider}
              onListAzureDeployments={controller.listAzureDeployments}
            />
          ) : null}
        </StatePanel>
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerStack: { width: '100%' },
});
