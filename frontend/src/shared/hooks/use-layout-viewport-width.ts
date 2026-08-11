import { Platform } from 'react-native';

import { getWebContentViewportWidth } from '@/shared/constants/layout';
import { useOptionalAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useStableViewportWidth } from '@/shared/hooks/use-stable-viewport-width';

/**
 * Layout width for breakpoint decisions on web — subtracts the permanent app drawer
 * so compact/table/card modes trigger based on usable content area, not full window width.
 */
export function useLayoutViewportWidth(): number {
  const viewportWidth = useStableViewportWidth();
  const shell = useOptionalAppShell();

  if (Platform.OS !== 'web') {
    return viewportWidth;
  }

  return getWebContentViewportWidth(viewportWidth, shell?.isSidebarCollapsed ?? false);
}

/** Full browser viewport width (drawer not subtracted). */
export function useWindowViewportWidth(): number {
  return useStableViewportWidth();
}

/** Compact check based on usable content width after the web drawer. */
export function useIsLayoutViewportCompact(breakpoint: number): boolean {
  const width = useLayoutViewportWidth();
  if (Platform.OS !== 'web') {
    return true;
  }
  return width < breakpoint;
}
