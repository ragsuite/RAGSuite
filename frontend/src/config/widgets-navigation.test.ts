import { getDrawerNavSections, isDrawerItemActive, type AppRouteName } from '@/config/navigation';
import { isWidgetRoute, resolveWidgetsEntryRoute, WIDGET_ROUTES } from '@/config/widgets-navigation';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/features/mcp/components/mcp-nav-icon', () => () => null);

const only =
  (...allowed: AppRouteName[]) =>
  (route: AppRouteName) =>
    allowed.includes(route);

function widgetItems(canAccessRoute?: (route: AppRouteName) => boolean, isOrgAdmin = false) {
  return getDrawerNavSections(true, { canAccessRoute, isOrgAdmin })
    .flatMap((section) => section.items)
    .filter((item) => item.groupRoutes || isWidgetRoute(item.route));
}

describe('resolveWidgetsEntryRoute', () => {
  it('prefers Chatbot, then Search, else null', () => {
    expect(resolveWidgetsEntryRoute(() => true)).toBe('chatbot-config');
    expect(resolveWidgetsEntryRoute(only('search-config'))).toBe('search-config');
    expect(resolveWidgetsEntryRoute(only('history'))).toBeNull();
  });
});

describe('Widgets drawer entry', () => {
  it('replaces the two config items with one Widgets item', () => {
    const items = widgetItems(() => true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ route: 'chatbot-config', labelKey: 'nav.widgets' });
    expect(items[0].groupRoutes).toEqual(WIDGET_ROUTES);
  });

  it('opens Search for search-only members', () => {
    expect(widgetItems(only('search-config'))[0]?.route).toBe('search-config');
  });

  it('keeps Chatbot for chatbot-only members', () => {
    expect(widgetItems(only('chatbot-config'))[0]?.route).toBe('chatbot-config');
  });

  it('hides Widgets when neither widget is accessible', () => {
    expect(widgetItems(only('history'))).toHaveLength(0);
  });

  it('org admins bypass route permissions', () => {
    expect(widgetItems(only('history'), true)[0]?.route).toBe('chatbot-config');
  });

  it('stays hidden in the native drawer (reachable via the bottom Widgets tab)', () => {
    const native = getDrawerNavSections(false, { canAccessRoute: () => true }).flatMap((s) => s.items);
    expect(native.some((item) => item.groupRoutes)).toBe(false);
  });
});

describe('isDrawerItemActive', () => {
  const widgets = { route: 'chatbot-config' as const, groupRoutes: WIDGET_ROUTES };

  it('matches every member route of a grouped item', () => {
    expect(isDrawerItemActive(widgets, 'chatbot-config')).toBe(true);
    expect(isDrawerItemActive(widgets, 'search-config')).toBe(true);
    expect(isDrawerItemActive(widgets, 'history')).toBe(false);
  });

  it('matches plain items by route only', () => {
    expect(isDrawerItemActive({ route: 'history' }, 'history')).toBe(true);
    expect(isDrawerItemActive({ route: 'history' }, 'mcp')).toBe(false);
  });
});
