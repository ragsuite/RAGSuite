/** Raw API shapes from OpenAPI — dashboard uses camelCase; overview uses snake_case. */

export type AnalyticsOverviewOut = {
  total_queries: number;
  avg_response_time_ms?: number | null;
  popular_terms?: PopularTermOut[];
  system_health: SystemHealthOut;
  crawl_status: CrawlStatusSummaryOut;
};

export type PopularTermOut = {
  term: string;
  count: number;
};

export type SystemHealthOut = {
  status: string;
  database: boolean;
  cache?: boolean | null;
  version: string;
  uptime_seconds?: number | null;
};

export type CrawlStatusSummaryOut = {
  active_jobs: number;
  failed_jobs: number;
  completed_jobs: number;
  pending_jobs: number;
  total_sources: number;
  total_documents: number;
};

export type AnalyticsMetricsOut = {
  totalQueries: number;
  totalQueriesChange?: number | null;
  avgLatencyP95?: number | null;
  avgLatencyP95Change?: number | null;
  satisfactionRate: number;
  satisfactionRateChange?: number | null;
  dailyAverage: number;
};

export type DailyQueryPointOut = {
  date: string;
  queries: number;
};

export type LatencyDataPointOut = {
  date: string;
  p95?: number | null;
  p50?: number | null;
};

export type SatisfactionDataPointOut = {
  date: string;
  satisfaction: number;
};

export type SourceCoverageItemOut = {
  name: string;
  value: number;
  color?: string | null;
};

export type PopularQueryItemOut = {
  query: string;
  count: number;
  satisfaction: number;
};

export type HardQueryItemOut = {
  query: string;
  attempts: number;
  satisfaction: number;
  avgLatency: string;
  lastAttempt: string;
};

export type AnalyticsDashboardOut = {
  metrics: AnalyticsMetricsOut;
  dailyQueries: DailyQueryPointOut[];
  latencyData: LatencyDataPointOut[];
  satisfactionData: SatisfactionDataPointOut[];
  sourceCoverage: SourceCoverageItemOut[];
  popularQueries: PopularQueryItemOut[];
  hardQueries: HardQueryItemOut[];
  timeRange: string;
};

export type SourceCoverageResponseOut = {
  sources: SourceCoverageItemOut[];
  totalSources: number;
};

export type PopularTermsOut = {
  terms: PopularTermOut[];
  total_unique_terms: number;
  date_range?: Record<string, string> | null;
};

export type HardQueriesResponseOut = {
  queries: HardQueryItemOut[];
  timeRange: string;
};

/** GET /api/v1/overview — unified bundle (schema is open-ended in OpenAPI). */
export type UnifiedOverviewOut = Record<string, unknown>;

/** Overview sub-routes return loosely typed JSON. */
export type ThumbsUpRateOut = {
  rate?: number;
  thumbs_up_rate?: number;
  thumbsUpRate?: number;
  percentage?: number;
  value?: number;
};

export type P95LatencyOut = {
  p95_latency_ms?: number;
  p95LatencyMs?: number;
  latency_ms?: number;
  latencyMs?: number;
  p95?: number;
  value?: number;
};

export type LatestFeedbackItemOut = {
  id?: string;
  message_id?: string;
  messageId?: string;
  query?: string | null;
  user_query?: string | null;
  userQuery?: string | null;
  feedback_text?: string | null;
  feedbackText?: string | null;
  user_message?: string | null;
  userMessage?: string | null;
  comment?: string | null;
  text?: string | null;
  feedback?: boolean | string | number;
  thumbs_up?: boolean;
  thumbsUp?: boolean;
  is_positive?: boolean;
  isPositive?: boolean;
  vote?: string;
  feedback_rating?: number | null;
  feedbackRating?: number | null;
  created_at?: string;
  createdAt?: string;
  relative_time?: string;
  relativeTime?: string;
  time_ago?: string;
  timeAgo?: string;
  timestamp?: string;
};

export type TopSourceOut = {
  url?: string;
  domain?: string;
  name?: string;
  docs?: number;
  document_count?: number;
  last_crawl?: string;
  lastCrawl?: string;
  errors?: number;
  error_count?: number;
};
