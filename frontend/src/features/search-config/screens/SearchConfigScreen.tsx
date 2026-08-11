import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Code2, FlaskConical, MessageSquare, Settings } from 'lucide-react-native';

import { SettingsPanel } from '@/features/search-config/components/SettingsPanel';
import { SearchConfigSkeleton } from '@/features/search-config/components/SearchConfigSkeleton';
import { TrainingPanel } from '@/features/search-config/components/TrainingPanel';
import { IntegrationsScriptsPanel } from '@/features/search-config/components/settings/IntegrationsScriptsPanel';
import { SearchTestPanel } from '@/features/search-config/components/settings/SearchTestPanel';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import type { SearchConfigPrimaryTab } from '@/features/search-config/types/search-config.types';
import { SEARCH_TAB_PERMISSIONS } from '@/features/organization/utils/workspace-permissions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

function SearchConfigContent() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces, mode } = useAppTheme();
  const { hasPermission } = useActiveProject();

  const canViewTab = (tab: SearchConfigPrimaryTab) => {
    const required = SEARCH_TAB_PERMISSIONS[tab];
    if (!required?.length) return true;
    return required.some((perm) => hasPermission(perm));
  };

  const visibleTabs = useMemo(
    () =>
      [
        {
          key: 'training' as const,
          label: t('search.tabs.training'),
          compactLabel: t('search.tabs.training'),
          icon: MessageSquare,
        },
        {
          key: 'settings' as const,
          label: t('search.tabs.settings'),
          compactLabel: t('search.tabs.settings'),
          icon: Settings,
        },
        {
          key: 'integrations' as const,
          label: t('search.tabs.integrations'),
          compactLabel: t('search.tabs.integrationsCompact'),
          icon: Code2,
        },
        {
          key: 'search-test' as const,
          label: t('search.tabs.searchTest'),
          compactLabel: t('search.tabs.searchTestCompact'),
          icon: FlaskConical,
        },
      ].filter((tab) => canViewTab(tab.key)),
    [hasPermission, t],
  );
  const { isWeb, isCompact, isNativeMobile, contentMaxWidth, horizontalPadding } = useSearchConfigLayout();
  const useCompactPrimaryTabs = isNativeMobile || isCompact;
  const resolvedHorizontalPadding = horizontalPadding ?? spacing.sm;
  const { loading, refreshing, error, feedback, primaryTab, setPrimaryTab, refresh, clearFeedback } = useSearchConfig();

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.key === primaryTab)) {
      setPrimaryTab(visibleTabs[0].key);
    }
  }, [primaryTab, setPrimaryTab, visibleTabs]);

  const showSkeleton = loading;
  const showErrorOnly = Boolean(error) && !showSkeleton;

  const tabRadius = surfaceRadius.button;

  const header = (
    <>
      {!isCompact ? (
        <PageSectionHeader title={t('search.title')} subtitle={t('search.description')} />
      ) : null}
      <View
        style={[
          styles.primaryTabRow,
          { gap: spacing.xs },
          useCompactPrimaryTabs ? styles.primaryTabRowCompact : null,
        ]}>
        {visibleTabs.map((tab) => {
          const active = primaryTab === tab.key;
          const Icon = tab.icon;
          const displayLabel = useCompactPrimaryTabs ? tab.compactLabel : tab.label;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('search.primaryTab.a11y', { label: tab.label })}
              onPress={() => setPrimaryTab(tab.key)}
              style={({ pressed, hovered }) => {
                const chrome = getWebParityTabStyle({
                  active,
                  pressed,
                  hovered,
                  colors,
                  surfaceRadius,
                  brandRadius: tabRadius,
                  useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                });
                return [
                styles.primaryTabBtn,
                useCompactPrimaryTabs ? styles.primaryTabBtnCompact : null,
                getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                {
                  paddingHorizontal: useCompactPrimaryTabs ? spacing.xxs : spacing.sm,
                  gap: useCompactPrimaryTabs ? 4 : spacing.xs,
                },
              ];
              }}>
              <Icon
                size={useCompactPrimaryTabs ? 16 : 14}
                color={
                  getWebParityTabStyle({
                    active,
                    pressed: false,
                    colors,
                    surfaceRadius,
                    brandRadius: tabRadius,
                    useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                  }).textColor
                }
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit={useCompactPrimaryTabs}
                minimumFontScale={0.8}
                style={[
                  typography.caption,
                  useCompactPrimaryTabs ? styles.primaryTabLabelCompact : null,
                  getWebParityTabLabelStyle(
                    getWebParityTabStyle({
                      active,
                      pressed: false,
                      colors,
                      surfaceRadius,
                      brandRadius: tabRadius,
                      useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                    }).textColor,
                    typography.caption,
                  ),
                ]}>
                {displayLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={resolvedHorizontalPadding}
        topPadding={isWeb ? spacing.md + spacing.xs : spacing.sm}
        bottomPaddingExtra={Platform.OS === 'web' ? 0 : 56}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        stickyHeaderDivider
        header={header}>
        {showSkeleton ? (
          <SearchConfigSkeleton />
        ) : showErrorOnly ? (
          <StatePanel error={error} onRetry={() => void refresh()}>
            {null}
          </StatePanel>
        ) : (
          <>
            {primaryTab === 'training' && canViewTab('training') ? <TrainingPanel /> : null}
            {primaryTab === 'settings' && canViewTab('settings') ? <SettingsPanel /> : null}
            {primaryTab === 'integrations' && canViewTab('integrations') ? <IntegrationsScriptsPanel /> : null}
            {primaryTab === 'search-test' && canViewTab('search-test') ? <SearchTestPanel /> : null}
          </>
        )}
      </FeatureScreenScroll>

      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

export function SearchConfigScreen() {
  return <SearchConfigContent />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerCompact: { alignItems: 'center' },
  headerCopy: { flex: 1, gap: 4 },
  primaryTabRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  primaryTabRowCompact: { flexWrap: 'nowrap' },
  primaryTabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryTabBtnCompact: { flex: 1, minWidth: 0 },
  primaryTabLabelCompact: { flexShrink: 1, fontSize: 11, lineHeight: 14 },
});
