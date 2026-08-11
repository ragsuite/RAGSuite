import { brandTokens } from '@/theme/brand-tokens';
import type { SurfaceRadius } from '@/theme/resolve-surface-radius';

export type UiMode = 'light' | 'dark';

export function toUiMode(mode: string): UiMode {
  return mode === 'dark' ? 'dark' : 'light';
}

const { color: c, dark: d } = brandTokens;

type SystemHealthUiOptions = {
  surfaceRadius?: SurfaceRadius;
};

export function systemHealthUi(mode: UiMode, options?: SystemHealthUiOptions) {
  const sectionRadius = options?.surfaceRadius?.card ?? 8;
  const controlRadius = options?.surfaceRadius?.button ?? 6;
  if (mode === 'dark') {
    return {
      pageBg: c.pineDeep,
      sectionBg: d.surfaceRaised,
      sectionBorder: d.borderHairline,
      cardBg: d.surfaceRaised,
      cardBorder: d.borderHairline,
      mutedTrack: d.surfaceSunken,
      healthy: { bg: c.pineBright, fg: c.paperRaised, softBg: d.primaryTintWash, softFg: c.pineTint },
      /** Secondary/muted — also used for `at_risk` (reference Badge variant="secondary"). */
      degraded: { bg: d.surfaceSunken, fg: d.textSecondary, softBg: d.surfaceSunken, softFg: d.textSecondary },
      atRisk: { bg: d.surfaceSunken, fg: d.textSecondary, softBg: d.surfaceSunken, softFg: d.textSecondary },
      down: { bg: c.error, fg: c.paperRaised, softBg: d.dangerSoftBg, softFg: d.dangerSoftFg },
      scoreGood: c.success,
      scoreWarn: c.warning,
      scoreBad: c.error,
      geometry: {
        sectionRadius,
        controlRadius,
        sectionGap: 16,
        serviceCardHeightWeb: 200,
        overallSectionMinHeightWeb: 120,
        serviceSectionMinHeightWeb: 0,
        legendSectionMinHeightWeb: 88,
        webColumnGap: 16,
        webColumnWidth: 320,
        serviceColumnsWeb: 3,
        overallProgressHeight: 8,
        serviceProgressHeight: 6,
      },
    } as const;
  }

  return {
    pageBg: c.paper,
    sectionBg: c.paperRaised,
    sectionBorder: c.hairline,
    cardBg: c.paperRaised,
    cardBorder: c.hairline,
    mutedTrack: c.paperSunken,
    healthy: { bg: c.pineBright, fg: c.paperRaised, softBg: c.pineTint, softFg: c.pineBright },
    /** Secondary/muted — also used for `at_risk` (reference Badge variant="secondary"). */
    degraded: { bg: c.paperSunken, fg: c.inkSoft, softBg: c.paperSunken, softFg: c.inkSoft },
    atRisk: { bg: c.paperSunken, fg: c.inkSoft, softBg: c.paperSunken, softFg: c.inkSoft },
    down: { bg: c.error, fg: c.paperRaised, softBg: c.ochreTint, softFg: c.error },
    scoreGood: c.success,
    scoreWarn: c.warning,
    scoreBad: c.error,
    geometry: {
      sectionRadius,
      controlRadius,
      sectionGap: 16,
      serviceCardHeightWeb: 200,
      overallSectionMinHeightWeb: 120,
      serviceSectionMinHeightWeb: 0,
      legendSectionMinHeightWeb: 88,
      webColumnGap: 16,
      webColumnWidth: 320,
      serviceColumnsWeb: 3,
      overallProgressHeight: 8,
      serviceProgressHeight: 6,
    },
  } as const;
}
