import { useEffect } from 'react';
import { Platform } from 'react-native';

import { applyWebDocumentTheme } from '@/shared/utils/apply-web-document-theme';

/** Mirrors reference `ThemeContext` — toggles `light` / `dark` class on `<html>`. */
export function useWebThemeClass(mode: 'light' | 'dark') {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    applyWebDocumentTheme(mode);

    return () => {
      document.documentElement.classList.remove('light', 'dark');
    };
  }, [mode]);
}
