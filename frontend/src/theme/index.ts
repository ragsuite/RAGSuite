import { brandTokens } from '@/theme/brand-tokens';
import { colors } from '@/theme/colors';
import { componentTokens } from '@/theme/component-tokens';
import { elevation } from '@/theme/elevation';
import { motion } from '@/theme/motion';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export const theme = {
  brandTokens,
  colors,
  componentTokens,
  elevation,
  motion,
  radius,
  spacing,
  typography,
} as const;

export { brandTokens } from '@/theme/brand-tokens';
export { componentTokens } from '@/theme/component-tokens';
export { isWebParitySurfaces, resolveSurfaceRadius } from '@/theme/resolve-surface-radius';
export type { SurfaceRadius } from '@/theme/resolve-surface-radius';
export { brandFontFamily, resolveBrandFonts } from '@/theme/fonts';
