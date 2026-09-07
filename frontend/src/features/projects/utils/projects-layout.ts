import { Platform } from 'react-native';

import {
  COMPACT_LAYOUT_BREAKPOINT,
  getFeatureContentMaxWidth,
  getFeatureHorizontalPadding,
  HEADER_STACK_BREAKPOINT,
  TOOLBAR_STACK_BREAKPOINT,
} from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

export const PROJECTS_COMPACT_BREAKPOINT = COMPACT_LAYOUT_BREAKPOINT;
export const PROJECTS_TOOLBAR_STACK_BREAKPOINT = TOOLBAR_STACK_BREAKPOINT;
export const PROJECTS_HEADER_STACK_BREAKPOINT = HEADER_STACK_BREAKPOINT;
/** Compact toolbar uses icon-only create below this width. */
export const PROJECTS_TOOLBAR_COMPACT_BREAKPOINT = 400;
export const PROJECTS_WEB_TOOLBAR_HEIGHT = 40;
export const PROJECTS_WEB_FILTER_WIDTH = 148;

export function getProjectsContentMaxWidth(width: number): number {
  return getFeatureContentMaxWidth(width);
}

export function getProjectsHorizontalPadding(width: number): number {
  return getFeatureHorizontalPadding(width);
}

export function useProjectsLayout() {
  const width = useLayoutViewportWidth();
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb;
  const isCompactWeb = isWeb && width < PROJECTS_COMPACT_BREAKPOINT;
  const isToolbarStacked = isWeb && width < PROJECTS_TOOLBAR_STACK_BREAKPOINT;
  const isHeaderStacked = isWeb && width < PROJECTS_HEADER_STACK_BREAKPOINT;
  const isToolbarCompact = width < PROJECTS_TOOLBAR_COMPACT_BREAKPOINT;
  const useFilterSheet = isNativeMobile || isCompactWeb;
  const useCardLayout = isNativeMobile || isCompactWeb;
  const useTableLayout = isWeb && !isCompactWeb;
  const showWebPageHeader = useTableLayout;

  return {
    width,
    isWeb,
    isNativeMobile,
    isCompactWeb,
    isToolbarStacked,
    isHeaderStacked,
    isToolbarCompact,
    useFilterSheet,
    useCardLayout,
    useTableLayout,
    showWebPageHeader,
    contentMaxWidth: isWeb ? getProjectsContentMaxWidth(width) : undefined,
    horizontalPadding: isWeb ? getProjectsHorizontalPadding(width) : undefined,
  };
}
