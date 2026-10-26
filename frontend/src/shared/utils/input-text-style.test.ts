import { Platform } from 'react-native';

import { MULTILINE_RESIZE_MAX_HEIGHT, getInputTextStyle } from '@/shared/utils/input-text-style';

describe('getInputTextStyle', () => {
  it('keeps web multiline fields vertically resizable with a max height', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const style = getInputTextStyle({}, { multiline: true }) as {
        resize?: string;
        maxHeight?: number;
        overflowY?: string;
      };
      expect(style.resize).toBe('vertical');
      expect(style.maxHeight).toBe(MULTILINE_RESIZE_MAX_HEIGHT);
      expect(style.overflowY).toBe('auto');
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });
});
