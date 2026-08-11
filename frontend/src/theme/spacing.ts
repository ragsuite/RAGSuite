import { brandTokens } from '@/theme/brand-tokens';

const { spacing: s } = brandTokens;

/** Brand spacing scale (4px base). Legacy aliases preserved for existing call sites. */
export const spacing = {
  xxs: s[1],
  xs: s[2],
  sm: s[3],
  md: s[4],
  lg: s[6],
  xl: s[8],
  xxl: s[12],
  /** Full token scale for new code. */
  1: s[1],
  2: s[2],
  3: s[3],
  4: s[4],
  6: s[6],
  8: s[8],
  12: s[12],
  16: s[16],
  24: s[24],
  32: s[32],
} as const;
