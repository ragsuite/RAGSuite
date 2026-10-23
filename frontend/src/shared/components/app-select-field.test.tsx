import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { AppSelectField } from '@/shared/components/app-select-field';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/shared/hooks/use-compact-layout', () => ({
  useCompactLayout: () => true,
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#111',
      textMuted: '#888',
      primary: '#00f',
      border: '#ccc',
      borderStrong: '#999',
      danger: '#c00',
      surface: '#fff',
      surfaceMuted: '#eee',
    },
    spacing: { xxs: 2, sm: 8 },
    typography: { fieldLabel: { fontSize: 13 }, fieldInput: { fontSize: 14 }, caption: { fontSize: 12 } },
    surfaceRadius: { input: 8 },
  }),
}));
jest.mock('@/shared/components/adaptive/adaptive-picker-option-list', () => ({
  AdaptivePickerOptionList: () => null,
}));
jest.mock('@/shared/components/adaptive/adaptive-popover', () => ({
  AdaptivePopover: () => null,
}));
jest.mock('@/shared/components/adaptive/adaptive-picker-sheet', () => ({
  AdaptivePickerSheet: () => null,
}));

function renderSelect(canWrite: boolean, ignoreWriteLock?: boolean) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <AppSelectField
          label="Provider"
          value="openai"
          options={[
            { key: 'openai', label: 'OpenAI' },
            { key: 'azure', label: 'Azure' },
          ]}
          onChange={() => undefined}
          ignoreWriteLock={ignoreWriteLock}
        />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('AppSelectField write lock', () => {
  it('disables the trigger when the module is read-only', () => {
    const tree = renderSelect(false);
    const trigger = tree.root.findByProps({ accessibilityLabel: 'Provider' });
    expect(trigger.props.disabled).toBe(true);
    expect(trigger.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('leaves the trigger enabled when the module can write', () => {
    const tree = renderSelect(true);
    const trigger = tree.root.findByProps({ accessibilityLabel: 'Provider' });
    expect(trigger.props.disabled).toBe(false);
  });

  it('stays enabled on read-only when ignoreWriteLock is set', () => {
    const tree = renderSelect(false, true);
    const trigger = tree.root.findByProps({ accessibilityLabel: 'Provider' });
    expect(trigger.props.disabled).toBe(false);
  });
});
