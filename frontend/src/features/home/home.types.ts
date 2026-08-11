import type { AppRouteName } from '@/config/navigation';

/** Mirrors backend / product static payload for Overview. */
export type HomeOverviewPayload = {
  queriesToday: number;
  queriesYesterday: number;
  p95Latency: number | null;
  thumbsUpRate: number;
  crawlErrors: number;
  topSources: {
    url: string;
    docs: number;
    lastCrawl: string;
    errors: number;
  }[];
  queryHistory: {
    date: string;
    queries: number;
  }[];
};

export type HomeQueryPoint = {
  date: string;
  label: string;
  queries: number;
};

export type HomeKpiVariant = 'queries' | 'latency' | 'thumbs' | 'crawlErrors';

export type HomeKpi = {
  key: HomeKpiVariant;
  label: string;
  value: string;
  note: string;
  badge?: string;
  severity?: 'default' | 'danger';
};

export type HomeQuickActionRoute = Exclude<AppRouteName, 'index' | 'onboarding' | 'sign-out'>;

export type HomeQuickAction = {
  key: string;
  label: string;
  description: string;
  route: HomeQuickActionRoute;
};

export type HomeModuleStatus = {
  key: string;
  title: string;
  description: string;
  status: 'healthy' | 'warning' | 'attention';
};

/** View model assembled from payload (single source of truth for UI). */
export type HomeOverview = {
  subtitle: string;
  kpis: HomeKpi[];
  querySeries: HomeQueryPoint[];
  topSources: HomeOverviewPayload['topSources'];
  latestFeedback: string | null;
};
