import type {
  PredefinedQuestion,
  SearchHistoryEntry,
} from '@/features/search-config/types/search-config.types';

export const SEARCH_FAQ_ANSWER_SOURCE = 'faq';

export type SearchFaqSelection = Pick<PredefinedQuestion, 'id' | 'text'>;

/** FAQ card answers are kept out of Recent Searches. */
export function isSearchFaqHistoryEntry(entry: Pick<SearchHistoryEntry, 'answer_source'>): boolean {
  return entry.answer_source === SEARCH_FAQ_ANSWER_SOURCE;
}

export type SearchFaqCardsVisibilityInput = {
  cardCount: number;
  showRecent: boolean;
  loading: boolean;
  query: string;
  hasAnswer: boolean;
};

/**
 * FAQ cards show before a search: hidden while Recent Searches is open, while an answer
 * streams, and while an answer is on screen (they return once the query is cleared).
 */
export function shouldShowSearchFaqCards({
  cardCount,
  showRecent,
  loading,
  query,
  hasAnswer,
}: SearchFaqCardsVisibilityInput): boolean {
  if (cardCount === 0 || showRecent || loading) return false;
  return query.trim() === '' || !hasAnswer;
}
