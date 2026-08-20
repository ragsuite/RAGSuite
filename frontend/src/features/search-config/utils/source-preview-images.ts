import type { SearchTestCitation } from '@/features/search-config/types/search-config.types';

/** Derived favicon for a citation URL (not hardcoded per-site art). */
export function faviconUrlForCitation(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === '#') return '';
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '');
    if (!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}

/**
 * Up to `max` distinct preview image URLs for the stacked "N sites" badge.
 * Prefers citation OG images, then per-host favicons — never repeats the same URI.
 */
export function pickUniqueSourcePreviewImages(
  citations: SearchTestCitation[],
  max = 3,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (uri: string) => {
    const key = uri.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const citation of citations) {
    if (out.length >= max) break;
    push(citation.image || '');
  }
  for (const citation of citations) {
    if (out.length >= max) break;
    push(faviconUrlForCitation(citation.url));
  }
  return out;
}
