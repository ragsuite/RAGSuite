import { brandTokens } from '@/theme/brand-tokens';

export const radius = {
  sm: brandTokens.radius.sm,
  md: brandTokens.radius.md,
  lg: brandTokens.radius.lg,
  pill: brandTokens.radius.pill,
} as const;

/** Dashboard cards/buttons/inputs: use surfaceRadius — not radius.sm/md/lg. */
