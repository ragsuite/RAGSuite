import { useSettingsOptional } from '@/features/settings/hooks/useSettings';
import { DEFAULT_SETTINGS, type UiThemeMode } from '@/features/settings/services/settings.service';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import {
  derivePrimarySoftFgHex,
  derivePrimaryTintDarkHex,
  derivePrimaryTintHex,
} from '@/shared/utils/branding-colors';
import { theme } from '@/theme';
import { resolveBrandFonts } from '@/theme/fonts';
import { isWebParitySurfaces, resolveSurfaceRadius } from '@/theme/resolve-surface-radius';

function shadeHexColor(hex: string, percent: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const factor = (100 + percent) / 100;
  const r = Math.min(255, Math.max(0, Math.round(((value >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((value >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((value & 0xff) * factor)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

type UseAppThemeOptions = {
  fontsLoaded?: boolean;
};

export function useAppTheme(options: UseAppThemeOptions = {}) {
  const settingsContext = useSettingsOptional();
  const effectiveTheme: UiThemeMode = settingsContext?.effectiveTheme ?? 'light';
  const settings = settingsContext?.settings ?? DEFAULT_SETTINGS;
  const isCompact = useCompactLayout();
  const mode = effectiveTheme;
  const scale = settings.global.fontScale;
  const palette = theme.colors[mode];
  const primaryColor = settings.global.primaryColor;
  const isDefaultPrimary = primaryColor.toLowerCase() === BRANDING_DEFAULTS.primaryColor.toLowerCase();
  const fonts = resolveBrandFonts(options.fontsLoaded ?? true);

  const typography = {
    hero: {
      ...theme.typography.hero,
      fontFamily: fonts.display,
      fontSize: Math.round(theme.typography.hero.fontSize * scale),
    },
    title: {
      ...theme.typography.title,
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(theme.typography.title.fontSize * scale),
    },
    subtitle: {
      ...theme.typography.subtitle,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.subtitle.fontSize * scale),
    },
    body: {
      ...theme.typography.body,
      fontFamily: fonts.sans,
      fontSize: Math.round(theme.typography.body.fontSize * scale),
    },
    caption: {
      ...theme.typography.caption,
      fontFamily: fonts.sans,
      fontSize: Math.round(theme.typography.caption.fontSize * scale),
    },
    fieldLabel: {
      ...theme.typography.fieldLabel,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.fieldLabel.fontSize * scale),
      lineHeight: Math.round(theme.typography.fieldLabel.lineHeight * scale),
    },
    fieldInput: {
      ...theme.typography.fieldInput,
      fontFamily: fonts.sans,
      fontSize: Math.round(theme.typography.fieldInput.fontSize * scale),
      lineHeight: Math.round(theme.typography.fieldInput.lineHeight * scale),
    },
    cardTitle: {
      ...theme.typography.cardTitle,
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(theme.typography.cardTitle.fontSize * scale),
      lineHeight: Math.round(theme.typography.cardTitle.lineHeight * scale),
    },
    panelTileLabel: {
      ...theme.typography.panelTileLabel,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.panelTileLabel.fontSize * scale),
      lineHeight: Math.round(theme.typography.panelTileLabel.lineHeight * scale),
    },
    chartCardTitle: {
      ...theme.typography.chartCardTitle,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.chartCardTitle.fontSize * scale),
      lineHeight: Math.round(theme.typography.chartCardTitle.lineHeight * scale),
    },
    listSectionTitle: {
      ...theme.typography.listSectionTitle,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.listSectionTitle.fontSize * scale),
      lineHeight: Math.round(theme.typography.listSectionTitle.lineHeight * scale),
    },
    listSectionDescription: {
      ...theme.typography.listSectionDescription,
      fontFamily: fonts.sans,
      fontSize: Math.round(theme.typography.listSectionDescription.fontSize * scale),
      lineHeight: Math.round(theme.typography.listSectionDescription.lineHeight * scale),
    },
    buttonLabel: {
      ...theme.typography.buttonLabel,
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(theme.typography.buttonLabel.fontSize * scale),
      lineHeight: Math.round(theme.typography.buttonLabel.lineHeight * scale),
    },
    headingSemibold: {
      ...theme.typography.headingSemibold,
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(theme.typography.headingSemibold.fontSize * scale),
      lineHeight: Math.round(theme.typography.headingSemibold.lineHeight * scale),
    },
    sectionDisplay: {
      ...theme.typography.sectionDisplay,
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(theme.typography.sectionDisplay.fontSize * scale),
      lineHeight: Math.round(theme.typography.sectionDisplay.lineHeight * scale),
    },
    pageDisplay: {
      ...theme.typography.pageDisplay,
      fontFamily: fonts.display,
      fontSize: Math.round(theme.typography.pageDisplay.fontSize * scale),
      lineHeight: Math.round(theme.typography.pageDisplay.lineHeight * scale),
    },
    eyebrow: {
      ...theme.typography.eyebrow,
      fontFamily: fonts.monoMedium,
      fontSize: Math.round(theme.typography.eyebrow.fontSize * scale),
    },
    citation: {
      ...theme.typography.citation,
      fontFamily: fonts.mono,
      fontSize: Math.round(theme.typography.citation.fontSize * scale),
    },
    metric: {
      ...theme.typography.metric,
      fontFamily: fonts.display,
      fontSize: Math.round(theme.typography.metric.fontSize * scale),
    },
    numeric: theme.typography.numeric,
  };

  return {
    mode,
    fonts,
    colors: {
      ...palette,
      primary: primaryColor,
      primaryPressed: isDefaultPrimary ? palette.primaryPressed : shadeHexColor(primaryColor, -12),
      primaryTint: isDefaultPrimary
        ? palette.primaryTint
        : mode === 'light'
          ? derivePrimaryTintHex(primaryColor)
          : derivePrimaryTintDarkHex(primaryColor),
      onPrimaryTint: isDefaultPrimary
        ? palette.onPrimaryTint
        : mode === 'light'
          ? primaryColor
          : derivePrimarySoftFgHex(primaryColor),
      surfaceHover: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : palette.background,
    },
    spacing: theme.spacing,
    typography,
    radius: theme.radius,
    isCompact,
    isWebParitySurfaces: isWebParitySurfaces({ isCompact }),
    surfaceRadius: resolveSurfaceRadius({ isCompact }),
    /** @deprecated Use `surfaceRadius` — kept for incremental migration. */
    componentRadius: resolveSurfaceRadius({ isCompact }),
    elevation: theme.elevation,
    motion: theme.motion,
  };
}
