import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { AllowedDomainRow } from '@/features/chatbot-config/components/settings/allowed-domains-panel-parts';
import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/shared/constants/action-icons', () => ({
  ActionIcons: new Proxy({}, { get: () => () => null }),
}));
jest.mock('@/shared/components/app-button', () => ({ AppButton: () => null }));
jest.mock('@/shared/components/app-select-field', () => ({ AppSelectField: () => null }));
jest.mock('@/shared/components/app-text-field', () => ({ AppTextField: () => null }));
jest.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { domain?: string }) =>
      vars?.domain ? `${key}:${vars.domain}` : key,
  }),
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#111',
      textMuted: '#888',
      border: '#ccc',
      surface: '#fff',
      danger: '#c00',
      dangerBackground: '#fee',
    },
    spacing: { sm: 8 },
    typography: { body: { fontSize: 14 }, caption: { fontSize: 12 } },
    surfaceRadius: { button: 8 },
    isWebParitySurfaces: false,
  }),
}));

const domain = {
  id: 'd1',
  domain: 'https://t3planet.de/*',
  scope: 'entire-site' as const,
  addedAt: '2026-01-01',
};

function renderRow(canWrite: boolean) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <AllowedDomainRow domain={domain} saving={false} onRemove={() => undefined} />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('AllowedDomainRow write lock', () => {
  it('hides delete when the module is read-only', () => {
    const tree = renderRow(false);
    expect(() =>
      tree.root.findByProps({ accessibilityLabel: 'chatbot.domains.remove.a11y:https://t3planet.de/*' }),
    ).toThrow();
  });

  it('shows delete when the module can write', () => {
    const tree = renderRow(true);
    const remove = tree.root.findByProps({
      accessibilityLabel: 'chatbot.domains.remove.a11y:https://t3planet.de/*',
    });
    expect(remove).toBeTruthy();
    expect(remove.props.accessibilityRole).toBe('button');
  });
});
