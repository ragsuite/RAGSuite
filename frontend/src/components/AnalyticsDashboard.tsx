import React from 'react';
import { StyleSheet } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import type { AnalyticsDashboard as AnalyticsDashboardData } from '@/features/analytics/analytics.types';
import { AnalyticsCharts } from '@/features/analytics/components/analytics-charts';

export { AnalyticsChartCard as DashboardCard } from '@/features/analytics/components/analytics-chart-card';

type AnalyticsDashboardProps = {
  embedded?: boolean;
  data: AnalyticsDashboardData | null;
  compactDates?: boolean;
};

export default function AnalyticsDashboard({
  embedded = false,
  data,
  compactDates = false,
}: AnalyticsDashboardProps) {
  const body = <AnalyticsCharts data={data} compactDates={compactDates} />;

  if (embedded) {
    return body;
  }

  return <AppScrollView contentContainerStyle={styles.scrollContent}>{body}</AppScrollView>;
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
