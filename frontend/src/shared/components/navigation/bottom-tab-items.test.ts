import { buildBottomTabItems } from '@/shared/components/navigation/bottom-tab-items';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const ROUTES = ['index', 'crawl-management', 'chatbot-config', 'search-config', 'settings'].map((name) => ({
  key: `${name}-key`,
  name,
}));

const indexOf = (name: string) => ROUTES.findIndex((route) => route.name === name);

describe('buildBottomTabItems', () => {
  it('collapses Chatbot + Search into one Widgets tab in the Chat slot', () => {
    const items = buildBottomTabItems(ROUTES, 0, () => true);
    expect(items.map((item) => item.labelKey)).toEqual([
      'nav.dashboard',
      'nav.crawl',
      'nav.tab.widgets',
      'nav.settings',
    ]);
    expect(items[2]).toMatchObject({ id: 'widgets', route: { name: 'chatbot-config' } });
  });

  it('is focused on either widget route', () => {
    for (const name of ['chatbot-config', 'search-config']) {
      const widgets = buildBottomTabItems(ROUTES, indexOf(name), () => true).find((i) => i.id === 'widgets');
      expect(widgets?.isFocused).toBe(true);
    }
    const onSettings = buildBottomTabItems(ROUTES, indexOf('settings'), () => true);
    expect(onSettings.find((i) => i.id === 'widgets')?.isFocused).toBe(false);
  });

  it('targets Search when only Search is accessible', () => {
    const items = buildBottomTabItems(ROUTES, 0, (route) => route !== 'chatbot-config');
    expect(items.find((i) => i.id === 'widgets')?.route.name).toBe('search-config');
  });

  it('hides Widgets when neither widget is accessible', () => {
    const items = buildBottomTabItems(ROUTES, 0, (route) => !route.endsWith('-config'));
    expect(items.some((i) => i.id === 'widgets')).toBe(false);
    expect(items).toHaveLength(3);
  });
});
