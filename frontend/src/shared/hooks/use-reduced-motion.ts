import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Honour `prefers-reduced-motion` (web) and system reduce-motion (native). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(media.matches);
      const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export function motionDuration(reducedMotion: boolean, durationMs: number): number {
  return reducedMotion ? 0 : durationMs;
}
