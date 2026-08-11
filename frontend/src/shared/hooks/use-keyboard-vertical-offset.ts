import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Approximate AppChromeHeader content row height (below status bar). */
export const APP_CHROME_HEADER_CONTENT_HEIGHT = 56;

type OffsetVariant = 'none' | 'safeTop' | 'chromeHeader' | 'modal';

/**
 * Shared keyboardVerticalOffset for KeyboardAvoidingView.
 * Prefer 0 when the avoiding view already sits below the chrome header.
 */
export function useKeyboardVerticalOffset(variant: OffsetVariant = 'none'): number {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web' || Platform.OS === 'android') {
    return 0;
  }

  switch (variant) {
    case 'safeTop':
      return Math.max(insets.top, 0);
    case 'chromeHeader':
      return Math.max(insets.top, 0) + APP_CHROME_HEADER_CONTENT_HEIGHT;
    case 'modal':
      return 0;
    case 'none':
    default:
      return 0;
  }
}
