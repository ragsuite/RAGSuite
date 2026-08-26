import { Platform } from 'react-native';

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> };
};

type FlushSync = (fn: () => void) => void;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getFlushSync(): FlushSync | null {
  if (Platform.OS !== 'web') return null;
  try {
    // Avoid static `react-dom` import — Expo web ships the package without ambient types in CI tsc.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reactDom = require('react-dom') as { flushSync?: FlushSync };
    return typeof reactDom.flushSync === 'function' ? reactDom.flushSync : null;
  } catch {
    return null;
  }
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

  const flushSync = getFlushSync();
  const commit = () => {
    if (flushSync) {
      flushSync(update);
      return;
    }
    update();
  };

  const doc = document as DocumentWithViewTransition;
  if (prefersReducedMotion() || typeof doc.startViewTransition !== 'function') {
    commit();
    return;
  }

  doc.startViewTransition(commit);
}
