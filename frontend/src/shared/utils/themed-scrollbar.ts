import { useMemo } from 'react';
import { Platform, type ScrollViewProps, type ViewStyle } from 'react-native';

import { useSettings } from '@/features/settings/hooks/useSettings';
import { brandTokens } from '@/theme/brand-tokens';

export type ThemedScrollbarVariant = 'screen' | 'sidebar' | 'overlay';

const SIDEBAR_NATIVE_ID = 'ragsuite-sidebar-scroll';

type ScrollbarPalette = {
  track: string;
  thumb: string;
  thumbHover: string;
  thumbActive: string;
  sidebarTrack: string;
  sidebarThumb: string;
  sidebarThumbHover: string;
};

const LIGHT_SCROLLBAR: ScrollbarPalette = {
  track: brandTokens.color.paper,
  thumb: brandTokens.color.hairlineStrong,
  thumbHover: brandTokens.color.inkFaint,
  thumbActive: brandTokens.color.pineBright,
  sidebarTrack: brandTokens.color.paperSunken,
  sidebarThumb: brandTokens.color.hairlineStrong,
  sidebarThumbHover: brandTokens.color.inkFaint,
};

const DARK_SCROLLBAR: ScrollbarPalette = {
  track: brandTokens.dark.surfaceSunken,
  thumb: brandTokens.dark.borderHairline,
  thumbHover: brandTokens.dark.borderStrong,
  thumbActive: brandTokens.color.pineBright,
  sidebarTrack: brandTokens.dark.surfaceSunken,
  sidebarThumb: brandTokens.dark.borderHairline,
  sidebarThumbHover: brandTokens.dark.borderStrong,
};

export function getScrollbarPalette(mode: 'light' | 'dark'): ScrollbarPalette {
  return mode === 'dark' ? DARK_SCROLLBAR : LIGHT_SCROLLBAR;
}

/** Sync scrollbar CSS variables on `<html>` when theme mode changes (web). */
export function applyScrollbarThemeVars(
  mode: 'light' | 'dark',
  root: HTMLElement = document.documentElement,
) {
  const palette = getScrollbarPalette(mode);
  root.style.setProperty('--scrollbar-track', palette.track);
  root.style.setProperty('--scrollbar-thumb', palette.thumb);
  root.style.setProperty('--scrollbar-thumb-hover', palette.thumbHover);
  root.style.setProperty('--scrollbar-thumb-active', palette.thumbActive);
  root.style.setProperty('--scrollbar-sidebar-track', palette.sidebarTrack);
  root.style.setProperty('--scrollbar-sidebar-thumb', palette.sidebarThumb);
  root.style.setProperty('--scrollbar-sidebar-thumb-hover', palette.sidebarThumbHover);
}

export function getWebScrollbarStyle(
  mode: 'light' | 'dark',
  variant: ThemedScrollbarVariant = 'screen',
): ViewStyle | undefined {
  if (Platform.OS !== 'web') return undefined;

  const palette = getScrollbarPalette(mode);
  const thumb =
    variant === 'sidebar' ? palette.sidebarThumb : palette.thumb;
  /** Overlay/sheet: transparent track so no gutter strip beside the thumb. */
  const track =
    variant === 'overlay'
      ? 'transparent'
      : variant === 'sidebar'
        ? palette.sidebarTrack
        : palette.track;

  return {
    scrollbarWidth: 'thin',
    scrollbarColor: `${thumb} ${track}`,
  } as ViewStyle;
}

export type ThemedScrollViewProps = Pick<
  ScrollViewProps,
  'showsVerticalScrollIndicator' | 'nativeID' | 'style' | 'indicatorStyle'
> & {
  dataSet?: { ragsuiteScrollbar: ThemedScrollbarVariant };
};

/** Web: keep native indicator on so RN Web does not apply `scrollbar-width: none`. */
export function useThemedScrollViewProps(
  variant: ThemedScrollbarVariant = 'screen',
): ThemedScrollViewProps {
  const { effectiveTheme } = useSettings();

  return useMemo(() => {
    const indicatorStyle =
      Platform.OS === 'ios' ? (effectiveTheme === 'dark' ? 'white' : 'black') : undefined;

    const base: ThemedScrollViewProps = {
      showsVerticalScrollIndicator: true,
      ...(indicatorStyle ? { indicatorStyle } : {}),
    };

    if (Platform.OS !== 'web') {
      return base;
    }

    return {
      ...base,
      ...(variant === 'sidebar' ? { nativeID: SIDEBAR_NATIVE_ID } : {}),
      dataSet: { ragsuiteScrollbar: variant },
      style: getWebScrollbarStyle(effectiveTheme, variant),
    };
  }, [effectiveTheme, variant]);
}
