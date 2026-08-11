import type { AnalyticsTimeRange } from '@/features/analytics/analytics.types';
import type {
  AnalyticsDashboardOut,
  AnalyticsOverviewOut,
  HardQueriesResponseOut,
  PopularTermsOut,
  SourceCoverageResponseOut,
} from '@/features/analytics/types/analytics.api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

export async function handleGetOverview(projectId?: string | null): Promise<unknown> {
  const search = new URLSearchParams();
  appendProjectId(search, projectId);
  const query = search.toString();
  const path = query ? `${API_CONFIG.OVERVIEW}?${query}` : API_CONFIG.OVERVIEW;
  return get(path);
}

export type AnalyticsQueryParams = {
  projectId?: string | null;
  timeRange?: AnalyticsTimeRange;
  limit?: number;
  days?: number;
};

function appendProjectId(search: URLSearchParams, projectId?: string | null) {
  if (projectId) {
    search.set('project_id', projectId);
  }
}

export async function handleGetAnalyticsOverview(
  projectId?: string | null,
): Promise<AnalyticsOverviewOut> {
  const search = new URLSearchParams();
  appendProjectId(search, projectId);
  const query = search.toString();
  const path = query ? `${API_CONFIG.ANALYTICS_OVERVIEW}?${query}` : API_CONFIG.ANALYTICS_OVERVIEW;
  return (await get<AnalyticsOverviewOut>(path)) as AnalyticsOverviewOut;
}

export async function handleGetAnalyticsDashboard(
  params: AnalyticsQueryParams = {},
): Promise<AnalyticsDashboardOut> {
  const search = new URLSearchParams();
  if (params.timeRange) {
    search.set('time_range', params.timeRange);
  }
  appendProjectId(search, params.projectId);
  const path = `${API_CONFIG.ANALYTICS_DASHBOARD}?${search.toString()}`;
  return (await get<AnalyticsDashboardOut>(path)) as AnalyticsDashboardOut;
}

export async function handleGetAnalyticsSourceCoverage(
  projectId?: string | null,
): Promise<SourceCoverageResponseOut> {
  const search = new URLSearchParams();
  appendProjectId(search, projectId);
  const query = search.toString();
  const path = query
    ? `${API_CONFIG.ANALYTICS_SOURCE_COVERAGE}?${query}`
    : API_CONFIG.ANALYTICS_SOURCE_COVERAGE;
  return (await get<SourceCoverageResponseOut>(path)) as SourceCoverageResponseOut;
}

export async function handleGetPopularTerms(
  params: AnalyticsQueryParams = {},
): Promise<PopularTermsOut> {
  const search = new URLSearchParams();
  if (params.limit != null) {
    search.set('limit', String(params.limit));
  }
  appendProjectId(search, params.projectId);
  const path = `${API_CONFIG.ANALYTICS_POPULAR}?${search.toString()}`;
  return (await get<PopularTermsOut>(path)) as PopularTermsOut;
}

export async function handleGetHardQueries(
  params: AnalyticsQueryParams = {},
): Promise<HardQueriesResponseOut> {
  const search = new URLSearchParams();
  if (params.timeRange) {
    search.set('time_range', params.timeRange);
  }
  if (params.limit != null) {
    search.set('limit', String(params.limit));
  }
  appendProjectId(search, params.projectId);
  const path = `${API_CONFIG.ANALYTICS_HARD_QUERIES}?${search.toString()}`;
  return (await get<HardQueriesResponseOut>(path)) as HardQueriesResponseOut;
}

export async function handleGetThumbsUpRate(): Promise<unknown> {
  return get(API_CONFIG.OVERVIEW_THUMBS_UP_RATE);
}

export async function handleGetP95Latency(days = 1): Promise<unknown> {
  const search = new URLSearchParams();
  search.set('days', String(Math.min(30, Math.max(1, days))));
  return get(`${API_CONFIG.OVERVIEW_P95_LATENCY}?${search.toString()}`);
}

export async function handleGetLatestFeedback(limit = 10): Promise<unknown> {
  const search = new URLSearchParams();
  search.set('limit', String(limit));
  return get(`${API_CONFIG.OVERVIEW_LATEST_FEEDBACK}?${search.toString()}`);
}

export async function handleGetOverviewTopSources(): Promise<unknown> {
  return get(API_CONFIG.OVERVIEW_TOP_SOURCES);
}
