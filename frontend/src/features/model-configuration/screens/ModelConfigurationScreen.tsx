import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ProviderCatalogSidebar } from '@/features/model-configuration/components/ProviderCatalogSidebar';
import { ProviderConfigPanel } from '@/features/model-configuration/components/ProviderConfigPanel';
import { useModelConfiguration } from '@/features/model-configuration/hooks/useModelConfiguration';
import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';
import { visibleCatalogProviders, type KindFilter } from '@/features/model-configuration/utils/provider-catalog';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { StatusBadge } from '@/shared/components/status-badge';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';

const SPLIT_Y_TOLERANCE = 16;

export function ModelConfigurationScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const { isWeb, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const controller = useModelConfiguration();
  const { bundle, loading, error, hasProject } = controller;
  const [activeProvider, setActiveProvider] = useState<ModelProviderKey>('openai');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [catalogHeight, setCatalogHeight] = useState<number | undefined>(undefined);
  const catalogYRef = useRef(0);
  const panelYRef = useRef(0);
  const panelHeightRef = useRef(0);

  const providers = useMemo(() => bundle?.providers ?? [], [bundle]);
  const filtered = useMemo(
    () => visibleCatalogProviders(providers, kindFilter, search),
    [kindFilter, providers, search],
  );

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((entry) => entry.key === activeProvider)) {
      setActiveProvider(filtered[0].key);
    }
  }, [filtered, activeProvider]);

  const syncSplitHeight = () => {
    const sideBySide = Math.abs(catalogYRef.current - panelYRef.current) < SPLIT_Y_TOLERANCE;
    const next = sideBySide && panelHeightRef.current > 0 ? panelHeightRef.current : undefined;
    setCatalogHeight((prev) => (prev === next ? prev : next));
  };

  const onCatalogLayout = (event: LayoutChangeEvent) => {
    catalogYRef.current = event.nativeEvent.layout.y;
    syncSplitHeight();
  };

  const onPanelLayout = (event: LayoutChangeEvent) => {
    panelYRef.current = event.nativeEvent.layout.y;
    panelHeightRef.current = event.nativeEvent.layout.height;
    syncSplitHeight();
  };

  const activeEntry = filtered.find((entry) => entry.key === activeProvider) ?? filtered[0];
  const configuredCount = bundle?.configuredCount ?? 0;
  const fillCatalog = catalogHeight != null;

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
        stickyHeaderBottomPadding={spacing.xs}
        stickyContentTopPadding={spacing.sm}
        header={header}>
        <StatePanel
          loading={loading && !bundle}
          error={error}
          onRetry={() => void controller.reload()}
          isEmpty={!hasProject || providers.length === 0}
          emptyLabel={hasProject ? t('modelConfiguration.empty') : t('modelConfiguration.noProject')}>
          <View style={[styles.body, { gap: spacing.md }]}>
            <View
              onLayout={onCatalogLayout}
              style={[
                styles.catalog,
                fillCatalog ? { height: catalogHeight, maxHeight: catalogHeight, overflow: 'hidden' } : null,
              ]}>
              <ProviderCatalogSidebar
                providers={providers}
                activeProvider={activeEntry?.key ?? activeProvider}
                kindFilter={kindFilter}
                search={search}
                fillHeight={fillCatalog}
                onSearch={setSearch}
                onFilter={setKindFilter}
                onSelect={setActiveProvider}
              />
            </View>
            {activeEntry ? (
              <View style={styles.panel} onLayout={onPanelLayout}>
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
              </View>
            ) : null}
          </View>
        </StatePanel>
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerStack: { width: '100%' },
  body: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  catalog: { flexGrow: 1, flexBasis: 320, minWidth: 280, maxWidth: 480 },
  panel: { flexGrow: 2, flexBasis: 420, minWidth: 280 },
});
