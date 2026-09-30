import type { CrawlSource } from '@/features/crawl/types/crawl.types';
import {
  crawlSourceKindForTab,
  getCrawlSourceKind,
  sourcesOfKind,
} from '@/features/crawl/utils/crawl-source-kind';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const source = (id: string, source_type: CrawlSource['source_type']) => ({ id, source_type }) as CrawlSource;

const sources = [source('d1', 'domain'), source('s1', 'sitemap'), source('d2', 'domain')];

describe('crawl source kinds', () => {
  it('splits sources by kind', () => {
    expect(sourcesOfKind(sources, 'domain').map((s) => s.id)).toEqual(['d1', 'd2']);
    expect(sourcesOfKind(sources, 'sitemap').map((s) => s.id)).toEqual(['s1']);
  });

  it('treats sources without a type as domain', () => {
    const legacy = { id: 'old' } as CrawlSource;
    expect(sourcesOfKind([legacy], 'domain')).toEqual([legacy]);
    expect(sourcesOfKind([legacy], 'sitemap')).toEqual([]);
  });

  it('sitemap config hides link-following fields and uses sitemap copy', () => {
    const config = getCrawlSourceKind('sitemap');
    expect(config.showDepth).toBe(false);
    expect(config.showRescopeRootLinks).toBe(false);
    expect(config.urlLabelKey).toBe('crawl.form.sitemapUrl.label');
    expect(config.titleKey).toBe('crawl.tabs.sitemap');
  });

  it('defaults to the domain config', () => {
    expect(getCrawlSourceKind(undefined).kind).toBe('domain');
    expect(getCrawlSourceKind(null).showDepth).toBe(true);
  });

  it('maps only source-list tabs to a kind', () => {
    expect(crawlSourceKindForTab('domain')).toBe('domain');
    expect(crawlSourceKindForTab('sitemap')).toBe('sitemap');
    expect(crawlSourceKindForTab('qa-pairs')).toBeNull();
  });
});
