import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { AppRangeField } from '@/shared/components/app-range-field';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#111',
      primary: '#00f',
      border: '#ccc',
      surface: '#fff',
      surfaceMuted: '#eee',
    },
    spacing: { xs: 4 },
    typography: { fieldLabel: { fontSize: 13 }, fieldInput: { fontSize: 14 }, body: { fontSize: 14 } },
    surfaceRadius: { input: 8 },
  }),
}));
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { Pressable: RNPressable } = require('react-native');
  function MockSlider({
    onValueChange,
    disabled,
  }: {
    onValueChange?: (value: number) => void;
    disabled?: boolean;
  }) {
    return React.createElement(RNPressable, {
      testID: 'slider',
      disabled,
      onPress: () => onValueChange?.(0.5),
    });
  }
  return { __esModule: true, default: MockSlider };
});

function renderRange(canWrite: boolean, onChange: (value: number) => void) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <AppRangeField label="Temperature" value={0.2} min={0} max={1} step={0.1} onChange={onChange} />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('AppRangeField write lock', () => {
  it('does not call onChange when the module is read-only', () => {
    const onChange = jest.fn();
    const tree = renderRange(false, onChange);
    act(() => {
      tree.root.findByProps({ testID: 'slider' }).props.onPress();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'slider' }).props.disabled).toBe(true);
  });

  it('calls onChange when the module can write', () => {
    const onChange = jest.fn();
    const tree = renderRange(true, onChange);
    act(() => {
      tree.root.findByProps({ testID: 'slider' }).props.onPress();
    });
    expect(onChange).toHaveBeenCalled();
  });
});
