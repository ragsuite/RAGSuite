import type { ItemEmbeddedModel } from '@/features/search-config/types/embedding.types';

/** Label from Chroma provider/model only — never overwrite with project active_*. */
export function formatEmbeddedModelDetailLabel(model: ItemEmbeddedModel): string {
  if (model.provider && model.model) {
    return `${model.provider} / ${model.model}`;
  }
  if (model.model) return model.model;
  if (model.provider) return model.provider;
  return model.collection;
}
