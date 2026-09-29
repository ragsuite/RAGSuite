import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { ProviderConfigPanel } from '@/features/model-configuration/components/ProviderConfigPanel';
import { useModelConfiguration } from '@/features/model-configuration/hooks/useModelConfiguration';
import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';
import { useTranslation } from '@/i18n';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function ModelConfigurationScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const controller = useModelConfiguration();
  const { bundle, loading, error, hasProject } = controller;
  const [activeProvider, setActiveProvider] = useState<ModelProviderKey>('openai');

  const providers = useMemo(() => bundle?.providers ?? [], [bundle]);
  const tabs = useMemo(
    () =>
      providers.map((entry) => ({
        key: entry.key,
        label: entry.label,
        icon: entry.config.configured ? CheckCircle2 : undefined,
      })),
    [providers],
  );

  useEffect(() => {
    if (providers.length > 0 && !providers.some((p) => p.key === activeProvider)) {
      setActiveProvider(providers[0].key);
    }
  }, [providers, activeProvider]);

  const activeEntry = providers.find((p) => p.key === activeProvider) ?? providers[0];
  const configuredCount = bundle?.configuredCount ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppKeyboardScreenScroll
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: scrollBottomPadding,
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: spacing.md,
        }}>
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

        <StatePanel
          loading={loading && !bundle}
          error={error}
          onRetry={() => void controller.reload()}
          isEmpty={!hasProject || providers.length === 0}
          emptyLabel={hasProject ? t('modelConfiguration.empty') : t('modelConfiguration.noProject')}>
          {activeEntry ? (
            <View style={{ gap: spacing.md }}>
              <CrawlSegmentTabs
                tabs={tabs}
                activeTab={activeEntry.key}
                onChange={setActiveProvider}
                variant="primary"
                appearance="pill"
                showScrollbar
              />
              <ProviderConfigPanel
                key={activeEntry.key}
                entry={activeEntry}
                saving={controller.savingProvider === activeEntry.key}
                removing={controller.removingProvider === activeEntry.key}
                onSave={controller.saveProvider}
                onTest={controller.testProvider}
                onRemove={controller.removeProvider}
              />
            </View>
          ) : null}
        </StatePanel>
      </AppKeyboardScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
