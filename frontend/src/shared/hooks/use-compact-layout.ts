import { Platform } from 'react-native';

import { COMPACT_LAYOUT_BREAKPOINT } from '@/shared/constants/layout';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

/** Native app layouts, or narrow web — bottom sheets, sheet pickers, stacked filters. */
export function useCompactLayout(breakpoint = COMPACT_LAYOUT_BREAKPOINT): boolean {
  const width = useLayoutViewportWidth();
  if (Platform.OS !== 'web') return true;
  return width < breakpoint;
}

export function isNativeAppLayout(): boolean {
  return Platform.OS !== 'web';
}
