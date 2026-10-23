import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ViewOnlyBadge } from '@/shared/components/read-only-permission-banner';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      textMuted: '#888',
      surfaceMuted: '#eee',
      onPrimaryTint: '#000',
      primaryTint: '#ddf',
    },
    radius: { pill: 999 },
    typography: { caption: { fontSize: 12 } },
  }),
}));

describe('ViewOnlyBadge', () => {
  it('renders nothing when not visible', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ViewOnlyBadge visible={false} />);
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it('renders the view-only chip when visible', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ViewOnlyBadge visible />);
    });
    const chip = tree!.root.findByProps({ accessibilityLabel: 'org.permissions.viewOnlyChip' });
    expect(chip).toBeTruthy();
    expect(chip.props.accessibilityHint).toBe('org.permissions.readOnlyBanner');
  });
});
