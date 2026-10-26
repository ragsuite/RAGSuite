import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Web hover cursor for locked (read-only) controls. Safe on View and TextInput. */
export function webLockedCursor(locked: boolean): ViewStyle & TextStyle {
  if (Platform.OS !== 'web' || !locked) return {};
  return { cursor: 'not-allowed' } as unknown as ViewStyle & TextStyle;
}
