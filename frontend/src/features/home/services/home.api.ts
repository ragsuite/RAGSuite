import type { HomeOverview, HomeOverviewPayload } from '@/features/home/home.types';

const OVERVIEW_STATIC: HomeOverviewPayload = {
  queriesToday: 0,
  queriesYesterday: 5,
  p95Latency: null,
  thumbsUpRate: 0,
  crawlErrors: 3,
  topSources: [
    {
      url: 'nitsan.ai',
      docs: 38,
      lastCrawl: '23h ago',
      errors: 0,
    },
    {
      url: 't3planet.de',
      docs: 30,
      lastCrawl: '1d ago',
      errors: 0,
    },
    {
      url: 'nitsan.ai',
      docs: 16,
      lastCrawl: '1d ago',
      errors: 0,
    },
  ],
  queryHistory: [
    { date: '2026-04-17', queries: 0 },
    { date: '2026-04-18', queries: 0 },
    { date: '2026-04-19', queries: 0 },
    { date: '2026-04-20', queries: 0 },
    { date: '2026-04-21', queries: 2 },
    { date: '2026-04-22', queries: 5 },
    { date: '2026-04-23', queries: 0 },
  ],
};

const OVERVIEW_SUBTITLE = 'Monitor your RAG system performance and user engagement.';

function shortWeekdayLabel(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return utc.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function formatQueriesDeltaBadge(today: number, yesterday: number): string | undefined {
  if (yesterday <= 0) return undefined;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  const arrow = pct <= 0 ? '↓' : '↑';
  return `${arrow} ${Math.abs(pct)}% avg response`;
}

function payloadToOverview(payload: HomeOverviewPayload): HomeOverview {
  const p95Display = payload.p95Latency == null ? '0ms' : `${payload.p95Latency}ms`;

  const queriesBadge = formatQueriesDeltaBadge(payload.queriesToday, payload.queriesYesterday);

  return {
    subtitle: OVERVIEW_SUBTITLE,
    kpis: [
      {
        key: 'queries',
        label: 'Queries Today',
        value: String(payload.queriesToday),
        note: 'from yesterday',
        badge: queriesBadge,
      },
      {
        key: 'latency',
        label: 'p95 Latency',
        value: p95Display,
        note: 'avg response time',
      },
      {
        key: 'thumbs',
        label: 'Thumbs-up Rate',
        value: `${payload.thumbsUpRate}%`,
        note: 'user satisfaction',
      },
      {
        key: 'crawlErrors',
        label: 'Crawl Errors',
        value: String(payload.crawlErrors),
        note: 'need attention',
        severity: 'danger',
      },
    ],
    querySeries: payload.queryHistory.map((row) => ({
      date: row.date,
      label: shortWeekdayLabel(row.date),
      queries: row.queries,
    })),
    topSources: payload.topSources,
    latestFeedback: null,
  };
}

export async function getHomeOverview(): Promise<HomeOverview> {
  await new Promise((resolve) => setTimeout(resolve, 320));
  return payloadToOverview(OVERVIEW_STATIC);
}
