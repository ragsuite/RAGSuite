export const THRESHOLD_PRESETS = ['strict', 'balanced', 'broad', 'custom'] as const;
export type ThresholdPreset = (typeof THRESHOLD_PRESETS)[number];

export const CHAT_PRESET_THRESHOLDS: Record<Exclude<ThresholdPreset, 'custom'>, number> = {
  strict: 0.55,
  balanced: 0.45,
  broad: 0.25,
};

export const SEARCH_PRESET_THRESHOLDS: Record<Exclude<ThresholdPreset, 'custom'>, number> = {
  strict: 0.5,
  balanced: 0.45,
  broad: 0.25,
};

export const RERANK_CANDIDATES_LIMITS = { min: 16, max: 256, step: 1, default: 64 } as const;

/** 0 = keyword only, 1 = vector only. Null in storage keeps the live fusion mix. */
export const KEYWORD_BLEND_LIMITS = { min: 0, max: 1, step: 0.05, default: 0.5 } as const;

export const CHAT_THRESHOLD_LIMITS = { min: 0.1, max: 0.7, step: 0.05 } as const;
export const SEARCH_THRESHOLD_LIMITS = { min: 0.1, max: 1, step: 0.05 } as const;

export function namedPresetThreshold(surface: 'chat' | 'search', preset: ThresholdPreset): number | null {
  if (preset === 'custom') return null;
  return surface === 'chat' ? CHAT_PRESET_THRESHOLDS[preset] : SEARCH_PRESET_THRESHOLDS[preset];
}
