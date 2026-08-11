import { useEffect } from 'react';
import { Platform } from 'react-native';

import { applyScrollbarThemeVars } from '@/shared/utils/themed-scrollbar';

/** Mirrors reference `ThemeContext` — toggles `light` / `dark` class on `<html>`. */
export function useWebThemeClass(mode: 'light' | 'dark') {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
    root.style.colorScheme = mode;
    applyScrollbarThemeVars(mode, root);

    return () => {
      root.classList.remove('light', 'dark');
    };
  }, [mode]);
}
