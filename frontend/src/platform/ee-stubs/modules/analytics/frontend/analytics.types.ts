export type AnalyticsTimeRange = '7d' | '30d' | '90d';

export type AnalyticsMetrics = {
  totalQueries: number;
  totalQueriesChange: number | null;
  avgLatencyP95: number | null;
  avgLatencyP95Change: number | null;
  satisfactionRate: number;
  satisfactionRateChange: number | null;
  dailyAverage: number;
};

export type AnalyticsDailyQuery = {
  date: string;
  queries: number;
};

export type AnalyticsLatencyPoint = {
  date: string;
  p95: number | null;
  p50: number | null;
};

export type AnalyticsSatisfactionPoint = {
  date: string;
  satisfaction: number;
};

export type AnalyticsSourceCoverage = {
  name: string;
  value: number;
  color: string;
};

export type AnalyticsPopularQuery = {
  query: string;
  count: number;
  satisfaction: number;
};

export type AnalyticsHardQuery = {
  query: string;
  attempts: number;
  satisfaction: number;
  avgLatency: string;
  lastAttempt: string;
};

export type AnalyticsLatestFeedbackItem = {
  id: string;
  query: string;
  vote: 'positive' | 'negative';
  relativeTime: string;
};

/** GET /api/v1/analytics/overview (snapshot KPIs + crawl sources). */
export type AnalyticsOverviewPayload = {
  queriesToday: number;
  queriesYesterday: number;
  p95Latency: number | null;
  thumbsUpRate: number;
  crawlErrors: number;
  tokenUsageTotal: number;
  tokenUsageIncomplete?: boolean;
  topSources: {
    url: string;
    docs: number;
    lastCrawl: string;
    errors: number;
  }[];
};

/** GET /api/v1/analytics/dashboard?timeRange=7d */
export type AnalyticsDashboardPayload = {
  metrics: AnalyticsMetrics;
  dailyQueries: AnalyticsDailyQuery[];
  latencyData: AnalyticsLatencyPoint[];
  satisfactionData: AnalyticsSatisfactionPoint[];
  sourceCoverage: AnalyticsSourceCoverage[];
  popularQueries: AnalyticsPopularQuery[];
  hardQueries: AnalyticsHardQuery[];
  timeRange: AnalyticsTimeRange;
};

export type AnalyticsKpiKey = 'queriesToday' | 'latency' | 'thumbs' | 'tokens';

export type AnalyticsKpi = {
  key: AnalyticsKpiKey;
  labelKey: string;
  value: string;
  noteKey: string;
  badge?: string;
};

/** Unified view model for Overview + Analytics screen. */
export type AnalyticsDashboard = {
  subtitleKey: string;
  kpis: AnalyticsKpi[];
  metrics: AnalyticsMetrics;
  dailyQueries: AnalyticsDailyQuery[];
  latencyData: AnalyticsLatencyPoint[];
  satisfactionData: AnalyticsSatisfactionPoint[];
  sourceCoverage: AnalyticsSourceCoverage[];
  popularQueries: AnalyticsPopularQuery[];
  hardQueries: AnalyticsHardQuery[];
  topSources: AnalyticsOverviewPayload['topSources'];
  latestFeedback: AnalyticsLatestFeedbackItem[];
  timeRange: AnalyticsTimeRange;
};
