import { Platform } from 'react-native';

import { webLockedCursor } from '@/shared/utils/web-locked-cursor';

describe('webLockedCursor', () => {
  it('returns not-allowed on web when locked', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    expect(webLockedCursor(true)).toEqual({ cursor: 'not-allowed' });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
  });

  it('returns empty when unlocked', () => {
    expect(webLockedCursor(false)).toEqual({});
  });
});
