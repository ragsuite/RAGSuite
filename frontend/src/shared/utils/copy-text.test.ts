import { Platform } from 'react-native';

import { copyText } from '@/shared/utils/copy-text';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const { setStringAsync } = jest.requireMock<{ setStringAsync: jest.Mock }>('expo-clipboard');

describe('copyText', () => {
  beforeEach(() => {
    setStringAsync.mockClear();
  });

  it('returns false for empty text', async () => {
    await expect(copyText('')).resolves.toBe(false);
  });

  it('uses clipboard on native', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith('hello');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
  });
});
