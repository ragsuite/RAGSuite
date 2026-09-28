import { Bot, Search, type LucideIcon } from 'lucide-react-native';

import type { AppRouteName } from '@/config/navigation';

/** Routes presented together as the "Widgets" module (order = tab order + entry priority). */
export const WIDGET_ROUTES = ['chatbot-config', 'search-config'] as const satisfies readonly AppRouteName[];

export type WidgetRoute = (typeof WIDGET_ROUTES)[number];

export type WidgetTabMeta = {
  route: WidgetRoute;
  /** Short tab label inside the Widgets switcher. */
  labelKey: string;
  descriptionKey: string;
  /** Standalone name outside the switcher (command palette, AI Assistant). */
  navLabelKey: string;
  icon: LucideIcon;
};

export const WIDGET_TABS: readonly WidgetTabMeta[] = [
  {
    route: 'chatbot-config',
    labelKey: 'widgets.tabs.chatbot',
    descriptionKey: 'widgets.tabs.chatbotDescription',
    navLabelKey: 'nav.chatbot-configuration',
    icon: Bot,
  },
  {
    route: 'search-config',
    labelKey: 'widgets.tabs.search',
    descriptionKey: 'widgets.tabs.searchDescription',
    navLabelKey: 'nav.search-configuration',
    icon: Search,
  },
];

const WIDGET_ROUTE_SET: ReadonlySet<string> = new Set(WIDGET_ROUTES);

export function isWidgetRoute(route: string | null | undefined): route is WidgetRoute {
  return Boolean(route) && WIDGET_ROUTE_SET.has(route as string);
}

/** First widget route the user may open (Chatbot, then Search), or null when neither is accessible. */
export function resolveWidgetsEntryRoute(canAccessRoute: (route: AppRouteName) => boolean): WidgetRoute | null {
  return WIDGET_ROUTES.find((route) => canAccessRoute(route)) ?? null;
}
