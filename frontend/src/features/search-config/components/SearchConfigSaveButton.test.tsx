import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';

jest.mock('@/shared/constants/action-icons', () => ({
  ActionIcons: new Proxy({}, { get: () => () => null }),
}));
jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/shared/components/app-button', () => {
  const ReactNative = require('react-native');
  const ReactLib = require('react');
  return {
    AppButton: ({ label }: { label: string }) =>
      ReactLib.createElement(ReactNative.Text, { accessibilityLabel: label }, label),
  };
});

function renderSave(canWrite: boolean) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <SearchConfigSaveButton label="Save changes" onPress={() => undefined} />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('SearchConfigSaveButton write lock', () => {
  it('hides when the module is read-only', () => {
    const tree = renderSave(false);
    expect(() => tree.root.findByProps({ accessibilityLabel: 'Save changes' })).toThrow();
  });

  it('shows when the module can write', () => {
    const tree = renderSave(true);
    expect(tree.root.findByType(Text).props.children).toBe('Save changes');
  });
});
