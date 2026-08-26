import { Platform } from 'react-native';

import { applyScrollbarThemeVars } from '@/shared/utils/themed-scrollbar';

/** Sync `<html>` light/dark class + scrollbar CSS vars (web only). */
export function applyWebDocumentTheme(mode: 'light' | 'dark'): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  root.style.colorScheme = mode;
  applyScrollbarThemeVars(mode, root);
}
