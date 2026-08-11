import { brandTokens } from '@/theme/brand-tokens';

/** Surface radii — mirrors `design-tokens.json` radius scale via brand-tokens. */
export const componentTokens = {
  cardRadius: brandTokens.radius.md,
  modalRadius: brandTokens.radius.lg,
  buttonRadius: brandTokens.radius.sm,
  inputRadius: brandTokens.radius.sm,
} as const;

export type ComponentRadius = {
  card: number;
  modal: number;
  button: number;
  input: number;
};
