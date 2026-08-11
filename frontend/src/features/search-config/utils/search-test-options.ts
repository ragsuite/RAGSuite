export const SEARCH_TEST_MAX_QUERY_LENGTH = 150;

export function findPredefinedSearchAnswer(
  query: string,
  questions: { text: string; answer?: string }[],
): string | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  const match = questions.find((item) => item.text.trim().toLowerCase() === normalized);
  const answer = match?.answer?.trim();
  return answer || null;
}
