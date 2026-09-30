import { FileCode2, Globe, type LucideIcon } from 'lucide-react-native';

import type { CrawlSource, CrawlSourceType } from '@/features/crawl/types/crawl.types';

export type CrawlSourceKindConfig = {
  kind: CrawlSourceType;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  addSourceKey: string;
  emptySourcesKey: string;
  urlLabelKey: string;
  urlPlaceholderKey: string;
  urlHelperKey: string;
  /** Link depth only applies when following links from the start URL. */
  showDepth: boolean;
  /** "Find missing pages" rescoping only applies when following links. */
  showRescopeRootLinks: boolean;
};

export const CRAWL_SOURCE_KINDS: Record<CrawlSourceType, CrawlSourceKindConfig> = {
  domain: {
    kind: 'domain',
    icon: Globe,
    titleKey: 'crawl.tabs.domain',
    descriptionKey: 'crawl.domain.description',
    addSourceKey: 'crawl.domain.addSource',
    emptySourcesKey: 'crawl.table.empty',
    urlLabelKey: 'crawl.form.url.label',
    urlPlaceholderKey: 'crawl.form.url.placeholder',
    urlHelperKey: 'crawl.form.url.helper',
    showDepth: true,
    showRescopeRootLinks: true,
  },
  sitemap: {
    kind: 'sitemap',
    icon: FileCode2,
    titleKey: 'crawl.tabs.sitemap',
    descriptionKey: 'crawl.sitemap.description',
    addSourceKey: 'crawl.sitemap.addSource',
    emptySourcesKey: 'crawl.sitemap.emptySources',
    urlLabelKey: 'crawl.form.sitemapUrl.label',
    urlPlaceholderKey: 'crawl.form.sitemapUrl.placeholder',
    urlHelperKey: 'crawl.form.sitemapUrl.helper',
    showDepth: false,
    showRescopeRootLinks: false,
  },
};

export function getCrawlSourceKind(kind: CrawlSourceType | null | undefined): CrawlSourceKindConfig {
  return CRAWL_SOURCE_KINDS[kind ?? 'domain'] ?? CRAWL_SOURCE_KINDS.domain;
}

export function sourcesOfKind(sources: readonly CrawlSource[], kind: CrawlSourceType): CrawlSource[] {
  return sources.filter((source) => (source.source_type ?? 'domain') === kind);
}

/** Primary crawl tabs that host a crawl-source list, mapped to the source kind they show. */
export function crawlSourceKindForTab(tab: string): CrawlSourceType | null {
  if (tab === 'domain') return 'domain';
  if (tab === 'sitemap') return 'sitemap';
  return null;
}
