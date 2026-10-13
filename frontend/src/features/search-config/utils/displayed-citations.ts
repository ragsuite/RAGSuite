import type { SearchTestCitation, SearchTestResult } from '@/features/search-config/types/search-config.types';

/**
 * Sources to show beside a search answer.
 *
 * Early sources stream before the answer exists, so they only fill the gap while
 * streaming. Once the result arrives its list is final: the server empties it for
 * refusals ("out of the context of the provided documents") and that must stick.
 */
export function displayedCitations(
  result: SearchTestResult | null | undefined,
  streamingSources: SearchTestCitation[] | undefined,
): SearchTestCitation[] {
  if (result) return result.citations ?? [];
  return streamingSources ?? [];
}
