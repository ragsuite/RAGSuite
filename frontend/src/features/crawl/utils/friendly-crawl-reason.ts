type TranslateFn = (key: string) => string;

const SKIP_REASON_KEYS: Record<string, string> = {
  invalid_scheme: 'crawl.jobs.skipReason.invalidScheme',
  binary_extension: 'crawl.jobs.skipReason.binaryExtension',
  invalid_hostname: 'crawl.jobs.skipReason.invalidHostname',
  blocked_external_domain: 'crawl.jobs.skipReason.blockedExternalDomain',
  external_domain: 'crawl.jobs.skipReason.externalDomain',
  denylist_match: 'crawl.jobs.skipReason.denylistMatch',
  allowlist_miss: 'crawl.jobs.skipReason.allowlistMiss',
  depth_limit_exceeded: 'crawl.jobs.skipReason.depthLimit',
};

export function friendlyCrawlReason(reason: string | undefined, t: TranslateFn): string {
  if (!reason?.trim()) return t('crawl.jobs.reason.unknown');
  const value = reason.trim();
  const skipKey = SKIP_REASON_KEYS[value];
  if (skipKey) return t(skipKey);
  const lower = value.toLowerCase();
  if (lower.includes('ssl') || lower.includes('certificate')) {
    return t('crawl.jobs.reason.ssl');
  }
  if (lower.includes('connection') || lower.includes('timeout')) {
    return t('crawl.jobs.reason.connection');
  }
  if (value.startsWith('http_4')) return t('crawl.jobs.reason.http4xx');
  if (value.startsWith('http_5')) return t('crawl.jobs.reason.http5xx');
  if (lower.includes('pdf')) return t('crawl.jobs.reason.pdf');
  if (lower.includes('unexpected_error') || lower.includes('parse')) {
    return t('crawl.jobs.reason.unexpected');
  }
  return value;
}
