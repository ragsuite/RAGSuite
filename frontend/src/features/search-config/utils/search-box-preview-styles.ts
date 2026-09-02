import type { SearchBoxConfig } from '@/features/search-config/types/search-config.types';
import { getRelativeLuminance, isLightBackground } from '@/features/chatbot-config/utils/widget-theme-utils';
import { brandTokens } from '@/theme/brand-tokens';

const { color } = brandTokens;

export const SEARCH_BOX_WRAPPER_BG = color.paperSunken;
export const SEARCH_BOX_INNER_BG = color.paperRaised;
/** Fixed ink on the light widget search surface (not theme-dependent). */
export const SEARCH_BOX_INPUT_TEXT_COLOR = color.ink;
export const SEARCH_BOX_INPUT_MUTED_COLOR = color.inkFaint;

export function getSearchBoxBorderRadiusPx(borderRadius: SearchBoxConfig['borderRadius']): number {
  switch (borderRadius) {
    case 'rounded':
      return 12;
    case 'medium-rounded':
      return 10;
    case 'semi-rounded':
      return 8;
    case 'square':
      return 0;
    default:
      return 8;
  }
}

/** Picks a readable icon/label color against the search button background. */
export function resolveSearchBoxButtonIconColor(
  buttonBackground: string,
  options?: { fallbackMuted?: string; fallbackOnCustom?: string },
): string {
  const fallbackMuted = options?.fallbackMuted ?? color.inkFaint;
  const fallbackOnCustom = options?.fallbackOnCustom ?? color.paperRaised;
  const bgLum = getRelativeLuminance(buttonBackground);

  if (isLightBackground(buttonBackground)) {
    return bgLum > 0.85 ? color.ink : fallbackMuted;
  }

  const onDark = fallbackOnCustom;
  const onDarkLum = getRelativeLuminance(onDark);
  if (Math.abs(onDarkLum - bgLum) < 0.12) {
    return color.hairline;
  }
  return onDark;
}

export function resolveSearchBoxButtonColors(
  config: SearchBoxConfig,
  fallbackMuted: string,
  options?: { iconMuted?: string; iconOnCustom?: string },
): {
  isCustomizedStyle: boolean;
  buttonBgColor: string;
  buttonIconColor: string;
} {
  const isCustomizedStyle = config.style === 'customise';
  const buttonBgColor = isCustomizedStyle && config.backgroundColor.trim()
    ? config.backgroundColor.trim()
    : fallbackMuted;
  const buttonIconColor = resolveSearchBoxButtonIconColor(buttonBgColor, {
    fallbackMuted: options?.iconMuted ?? color.inkFaint,
    fallbackOnCustom: options?.iconOnCustom ?? color.paperRaised,
  });
  return { isCustomizedStyle, buttonBgColor, buttonIconColor };
}
