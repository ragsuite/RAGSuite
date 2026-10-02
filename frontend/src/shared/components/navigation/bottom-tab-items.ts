import { ChartColumn, Gauge, LayoutGrid, Settings, type LucideIcon } from 'lucide-react-native';

import type { AppRouteName } from '@/config/navigation';
import { isWidgetRoute, resolveWidgetsEntryRoute } from '@/config/widgets-navigation';

type TabRouteRef = {
  key: string;
  name: string;
  params?: object;
};

export type BottomTabItem = {
  /** Stable React key ("widgets" for the merged Chatbot + Search tab). */
  id: string;
  labelKey: string;
  icon: LucideIcon;
  isFocused: boolean;
  /** Route navigated to on press (the entry route for the merged Widgets tab). */
  route: TabRouteRef;
};

const SINGLE_TABS: Partial<Record<string, { labelKey: string; icon: LucideIcon }>> = {
  index: { labelKey: 'nav.dashboard', icon: ChartColumn },
  'crawl-management': { labelKey: 'nav.crawl', icon: Gauge },
  settings: { labelKey: 'nav.settings', icon: Settings },
};

const WIDGETS_TAB = { id: 'widgets', labelKey: 'nav.tab.widgets', icon: LayoutGrid } as const;

/** Bottom bar entries in navigator order; Chatbot + Search collapse into one Widgets tab. */
export function buildBottomTabItems(
  routes: readonly TabRouteRef[],
  focusedIndex: number,
  canAccessRoute: (route: string) => boolean,
): BottomTabItem[] {
  const focusedName = routes[focusedIndex]?.name;
  const items: BottomTabItem[] = [];
  let widgetsAdded = false;

  for (const route of routes) {
    if (isWidgetRoute(route.name)) {
      if (widgetsAdded) continue;
      widgetsAdded = true;
      const entryName = resolveWidgetsEntryRoute((name: AppRouteName) => canAccessRoute(name));
      const entryRoute = entryName ? routes.find((r) => r.name === entryName) : undefined;
      if (!entryRoute) continue;
      items.push({ ...WIDGETS_TAB, isFocused: isWidgetRoute(focusedName), route: entryRoute });
      continue;
    }
    const meta = SINGLE_TABS[route.name];
    if (!meta || !canAccessRoute(route.name)) continue;
    items.push({ id: route.key, ...meta, isFocused: route.name === focusedName, route });
  }
  return items;
}
