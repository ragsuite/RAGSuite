import { Platform, type ViewStyle } from 'react-native';

export function webSticky(top = 0): ViewStyle {
  if (Platform.OS !== 'web') return {};
  return {
    position: 'sticky',
    top,
    zIndex: 2,
    alignSelf: 'flex-start',
  } as ViewStyle;
}
