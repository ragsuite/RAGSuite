import { Activity } from 'lucide-react-native';
import React from 'react';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { HealthDashboardSkeleton } from '@/features/system-health/components/health-dashboard-skeleton';
import { HealthHeader } from '@/features/system-health/components/HealthHeader';
import { HealthLegend } from '@/features/system-health/components/HealthLegend';
import { OverallHealthCard } from '@/features/system-health/components/OverallHealthCard';
import { ServiceStatusCard } from '@/features/system-health/components/ServiceStatusCard';
import { systemHealthUi, toUiMode } from '@/features/system-health/system-health-ui.tokens';
import { useSystemHealth } from '@/features/system-health/hooks/useSystemHealth';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function SystemHealthScreen() {
  const { t, locale } = useTranslation();
  const { mode, colors, spacing, typography, surfaceRadius } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const isWeb = Platform.OS === 'web';
  const { width, contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const { data, loading, refreshing, error, isEmpty, refresh, reload } = useSystemHealth();

  const lastUpdatedLabel = (() => {
    if (!data?.timestamp) return '—';
    try {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(data.timestamp));
    } catch {
      return data.timestamp;
    }
  })();

  const sectionRadius = ui.geometry.sectionRadius;
  const serviceColumns = !isWeb ? 1 : width >= 1200 ? 3 : width >= 880 ? 2 : 1;
  const columnGap = ui.geometry.webColumnGap;

  const showSkeleton = loading && !data;
  const showErrorOnly = Boolean(error) && !data;

  return (
    <AppScrollView
      style={[styles.root, { backgroundColor: ui.pageBg }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.sm) : spacing.sm,
          paddingTop: isWeb ? spacing.md : spacing.sm,
          gap: spacing.md,
          width: '100%',
          paddingBottom: scrollBottomPadding,
          ...(isWeb ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const } : null),
        },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />
      }>
      {showSkeleton ? <HealthDashboardSkeleton /> : null}

      {showErrorOnly ? (
        <StatePanel loading={false} error={error} onRetry={() => void reload()}>
          {null}
        </StatePanel>
      ) : null}

      {!showSkeleton && !showErrorOnly && data ? (
        <>
          <HealthHeader onRefresh={() => void refresh()} refreshing={refreshing} />

          <OverallHealthCard
            overallHealthScore={data.overallHealthScore}
            overallStatus={data.overallStatus}
            lastUpdatedLabel={lastUpdatedLabel}
            minHeightWeb={ui.geometry.overallSectionMinHeightWeb}
          />

          <View
            style={[
              styles.section,
              {
                borderRadius: sectionRadius,
                borderColor: ui.sectionBorder,
                backgroundColor: ui.sectionBg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                gap: spacing.md,
              },
            ]}>
            <View style={{ gap: 4 }}>
              <View style={styles.sectionTitleRow}>
                <Activity size={20} color={colors.text} strokeWidth={2.1} />
                <Text
                  style={[
                    typography.sectionDisplay,
                    styles.sectionTitle,
                    { color: colors.text },
                  ]}>
                  {t('system-health.services.title')}
                </Text>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted, fontSize: 13, lineHeight: 18 }]}>
                {t('system-health.services.description')}
              </Text>
            </View>

            {isEmpty ? (
              <View
                style={[
                  styles.emptyPanel,
                  {
                    borderColor: ui.sectionBorder,
                    backgroundColor: ui.mutedTrack,
                    borderRadius: sectionRadius,
                    padding: spacing.md,
                  },
                ]}>
                <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
                  {t('system-health.empty.noServices')}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.serviceGrid,
                  {
                    marginHorizontal: isWeb ? -columnGap / 2 : 0,
                    rowGap: columnGap,
                  },
                ]}>
                {data.services.map((service) => (
                  <View
                    key={service.id}
                    style={[
                      styles.serviceCell,
                      isWeb
                        ? {
                            flexBasis: `${100 / serviceColumns}%` as const,
                            maxWidth: `${100 / serviceColumns}%` as const,
                            minWidth: `${100 / serviceColumns}%` as const,
                            paddingHorizontal: columnGap / 2,
                          }
                        : { flexBasis: '100%' as const, maxWidth: '100%' as const, minWidth: '100%' as const },
                    ]}>
                    <ServiceStatusCard service={service} minHeightWeb={ui.geometry.serviceCardHeightWeb} />
                  </View>
                ))}
              </View>
            )}
          </View>

          <HealthLegend minHeightWeb={ui.geometry.legendSectionMinHeightWeb} />
        </>
      ) : null}
    </AppScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {},
  section: {
    borderWidth: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  serviceCell: {
    flexGrow: 0,
  },
  emptyPanel: {
    borderWidth: 1,
  },
});
