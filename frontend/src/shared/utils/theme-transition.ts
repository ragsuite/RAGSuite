import { Platform } from 'react-native';
import { flushSync } from 'react-dom';

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> };
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs a theme update inside the View Transitions API on web when available,
 * so StyleSheet color flips crossfade instead of snapping. Native / reduced-motion
 * / unsupported browsers apply the update immediately.
 */
export function runThemeTransition(update: () => void): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    update();
    return;
  }

  const commit = () => {
    flushSync(update);
  };

  const doc = document as DocumentWithViewTransition;
  if (prefersReducedMotion() || typeof doc.startViewTransition !== 'function') {
    commit();
    return;
  }

  doc.startViewTransition(commit);
}
