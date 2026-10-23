import { Platform, type ViewStyle } from 'react-native';

/** Web hover cursor for locked (read-only) controls. */
export function webLockedCursor(locked: boolean): ViewStyle {
  if (Platform.OS !== 'web' || !locked) return {};
  return { cursor: 'not-allowed' } as ViewStyle;
}
