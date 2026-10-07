import type { ItemEmbeddedModel } from '@/features/search-config/types/embedding.types';
import { formatModelProviderLabel } from '@/features/search-config/utils/model-settings-options';

/** Label from Chroma provider/model only — never overwrite with project active_*. */
export function formatEmbeddedModelDetailLabel(model: ItemEmbeddedModel): string {
  const providerLabel = model.provider ? formatModelProviderLabel(model.provider) : '';
  if (providerLabel && model.model) {
    return `${providerLabel} / ${model.model}`;
  }
  if (model.model) return model.model;
  if (providerLabel) return providerLabel;
  return model.collection;
}
