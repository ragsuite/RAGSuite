type BannerColors = {
  border: string;
  surfaceMuted: string;
  textMuted: string;
  danger: string;
  dangerBackground: string;
  warning: string;
  ochreTint: string;
  success: string;
  primaryTint: string;
};

export function semanticBannerTones(
  variant: 'warning' | 'error' | 'success' | 'neutral',
  colors: BannerColors,
) {
  if (variant === 'warning') {
    return { border: colors.warning, bg: colors.ochreTint, text: colors.warning };
  }
  if (variant === 'error') {
    return { border: colors.danger, bg: colors.dangerBackground, text: colors.danger };
  }
  if (variant === 'success') {
    return { border: colors.success, bg: colors.primaryTint, text: colors.success };
  }
  return { border: colors.border, bg: colors.surfaceMuted, text: colors.textMuted };
}
