import type { EmbeddingItemCoverage } from '@/features/search-config/types/embedding.types';

/**
 * Coverage after a refresh. A failed or timed-out fetch (`next` null) keeps the last coverage
 * of the same project, so "Trained with" does not flip to None while Chroma is busy.
 */
export function retainEmbeddingCoverage(
  previous: EmbeddingItemCoverage | null,
  next: EmbeddingItemCoverage | null,
  projectId: string | null | undefined,
): EmbeddingItemCoverage | null {
  if (next) return next;
  if (!previous || !projectId) return null;
  return previous.project_id.toLowerCase() === projectId.toLowerCase() ? previous : null;
}
