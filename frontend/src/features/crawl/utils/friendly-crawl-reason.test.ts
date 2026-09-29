import { friendlyCrawlReason } from '@/features/crawl/utils/friendly-crawl-reason';

const t = (key: string) => `t:${key}`;

describe('friendlyCrawlReason', () => {
  it('maps known skip codes to plain-language keys', () => {
    expect(friendlyCrawlReason('external_domain', t)).toBe('t:crawl.jobs.skipReason.externalDomain');
    expect(friendlyCrawlReason('binary_extension', t)).toBe('t:crawl.jobs.skipReason.binaryExtension');
    expect(friendlyCrawlReason('depth_limit_exceeded', t)).toBe('t:crawl.jobs.skipReason.depthLimit');
    expect(friendlyCrawlReason(' denylist_match ', t)).toBe('t:crawl.jobs.skipReason.denylistMatch');
  });

  it('maps failure reasons by pattern', () => {
    expect(friendlyCrawlReason('ssl_certificate_verification_failed', t)).toBe('t:crawl.jobs.reason.ssl');
    expect(friendlyCrawlReason('connection_or_timeout_error', t)).toBe('t:crawl.jobs.reason.connection');
    expect(friendlyCrawlReason('http_404', t)).toBe('t:crawl.jobs.reason.http4xx');
    expect(friendlyCrawlReason('http_503', t)).toBe('t:crawl.jobs.reason.http5xx');
    expect(friendlyCrawlReason('unexpected_error: boom', t)).toBe('t:crawl.jobs.reason.unexpected');
  });

  it('falls back to unknown for empty input and passes other text through', () => {
    expect(friendlyCrawlReason(undefined, t)).toBe('t:crawl.jobs.reason.unknown');
    expect(friendlyCrawlReason('   ', t)).toBe('t:crawl.jobs.reason.unknown');
    expect(friendlyCrawlReason('Robots.txt disallows this page', t)).toBe('Robots.txt disallows this page');
  });
});
