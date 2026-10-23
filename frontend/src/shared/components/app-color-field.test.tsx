import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ModuleWriteProvider } from '@/features/organization/hooks/use-module-write';
import { AppColorField } from '@/shared/components/app-color-field';

jest.mock('@/shared/components/app-color-picker-trigger', () => ({
  AppColorPickerTrigger: () => null,
}));
jest.mock('@/shared/components/app-native-color-picker-sheet', () => ({
  AppNativeColorPickerSheet: () => null,
}));
jest.mock('@/shared/components/app-color-preview-swatch', () => ({
  AppColorPreviewSwatch: () => null,
}));
jest.mock('@/shared/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#111',
      textMuted: '#888',
      primary: '#00f',
      border: '#ccc',
      surfaceMuted: '#eee',
    },
    spacing: { xxs: 2 },
    typography: { fieldLabel: { fontSize: 13 }, fieldInput: { fontSize: 14 } },
    surfaceRadius: { button: 8 },
  }),
}));

function renderField(canWrite: boolean, onChange = () => undefined) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ModuleWriteProvider canWrite={canWrite}>
        <AppColorField label="Brand color" value="#112233" onChange={onChange} />
      </ModuleWriteProvider>,
    );
  });
  return tree!;
}

describe('AppColorField write lock', () => {
  it('keeps the hex input read-only when the module cannot write', () => {
    const onChange = jest.fn();
    const tree = renderField(false, onChange);
    const input = tree.root.findByProps({ accessibilityLabel: 'Brand color' });
    expect(input.props.editable).toBe(false);
    expect(input.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    act(() => {
      input.props.onChangeText?.('#ffffff');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets the hex input change when the module can write', () => {
    const onChange = jest.fn();
    const tree = renderField(true, onChange);
    const input = tree.root.findByProps({ accessibilityLabel: 'Brand color' });
    expect(input.props.editable).toBe(true);
    act(() => {
      input.props.onChangeText('#ffffff');
    });
    expect(onChange).toHaveBeenCalledWith('#ffffff');
  });
});
