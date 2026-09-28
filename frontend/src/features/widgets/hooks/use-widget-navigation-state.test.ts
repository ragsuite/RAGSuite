import { widgetNavigationReducer } from '@/features/widgets/hooks/use-widget-navigation-state';

type P = 'training' | 'settings';
type T = 'overview' | 'faq';
type S = 'overview' | 'privacy';

const DEFAULTS = { primaryTab: 'training', trainingSubTab: 'overview', settingsSection: 'overview' } as const;
const reduce = widgetNavigationReducer<P, T, S>;

describe('widgetNavigationReducer', () => {
  it('updates each navigation level independently', () => {
    let state = reduce({ ...DEFAULTS, navigationKey: 0 }, { type: 'primaryTab', value: 'settings' });
    state = reduce(state, { type: 'trainingSubTab', value: 'faq' });
    state = reduce(state, { type: 'settingsSection', value: 'privacy' });
    expect(state).toEqual({
      primaryTab: 'settings',
      trainingSubTab: 'faq',
      settingsSection: 'privacy',
      navigationKey: 0,
    });
  });

  it('keeps the same object when a value does not change', () => {
    const start = { ...DEFAULTS, navigationKey: 0 };
    expect(reduce(start, { type: 'primaryTab', value: 'training' })).toBe(start);
  });

  it('reset returns every level to its start and bumps the key', () => {
    const deep = { primaryTab: 'settings', trainingSubTab: 'faq', settingsSection: 'privacy', navigationKey: 3 } as const;
    expect(reduce(deep, { type: 'reset', defaults: DEFAULTS })).toEqual({ ...DEFAULTS, navigationKey: 4 });
  });

  it('reset still bumps the key when already at the start (forces a scroll/panel remount)', () => {
    const start = { ...DEFAULTS, navigationKey: 0 };
    expect(reduce(start, { type: 'reset', defaults: DEFAULTS }).navigationKey).toBe(1);
  });
});
