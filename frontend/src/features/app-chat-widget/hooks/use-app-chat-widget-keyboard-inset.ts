import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Shared keyboard / visual-viewport inset for the floating chat widget.
 * Native: Keyboard events. Web: visualViewport (mobile browser chrome).
 */
export function useAppChatWidgetKeyboardInset(
  enabled: boolean,
  safeAreaBottom: number,
): number {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setKeyboardInset(0);
      return;
    }

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.visualViewport) {
        setKeyboardInset(0);
        return;
      }

      const viewport = window.visualViewport;
      const update = () => {
        const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        setKeyboardInset(Math.max(0, covered - safeAreaBottom));
      };

      update();
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      return () => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - safeAreaBottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled, safeAreaBottom]);

  return keyboardInset;
}

export type WidgetKeyboardInsets = Pick<EdgeInsets, 'bottom'>;
