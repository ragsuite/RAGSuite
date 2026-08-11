export function friendlyCrawlReason(reason?: string): string {
  if (!reason?.trim()) return 'Unknown error';
  const value = reason.trim();
  const lower = value.toLowerCase();
  if (lower.includes('ssl') || lower.includes('certificate')) {
    return "SSL certificate error — site couldn't be crawled securely.";
  }
  if (lower.includes('connection') || lower.includes('timeout')) {
    return "Could not reach this URL. Please check it's correct and accessible.";
  }
  if (value.startsWith('http_4')) return 'Page not found (HTTP 4xx).';
  if (value.startsWith('http_5')) return 'Server error on the target site (HTTP 5xx).';
  if (lower.includes('pdf')) return 'This PDF could not be read. It may be scanned or protected.';
  if (lower.includes('unexpected_error') || lower.includes('parse')) {
    return 'An unexpected error occurred while crawling this page.';
  }
  return value;
}
