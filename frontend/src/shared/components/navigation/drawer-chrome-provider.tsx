import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { AppSafeArea } from '@/shared/components/app-safe-area';

export type DrawerChromeState = {
  topInsetColor?: string;
  bottomInsetColor?: string;
};

type DrawerChromeContextValue = {
  setDrawerChrome: (chrome: DrawerChromeState) => void;
};

const DrawerChromeContext = createContext<DrawerChromeContextValue | null>(null);

const NATIVE_SHELL_EDGES: Edge[] = ['left', 'right'];
const WEB_SHELL_EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

type ProviderProps = {
  children: React.ReactNode;
};

export function DrawerChromeProvider({ children }: ProviderProps) {
  const [chrome, setChrome] = useState<DrawerChromeState>({});

  const setDrawerChrome = useCallback((next: DrawerChromeState) => {
    setChrome(next);
  }, []);

  const contextValue = useMemo(() => ({ setDrawerChrome }), [setDrawerChrome]);

  const edgeBackgroundColors =
    chrome.topInsetColor || chrome.bottomInsetColor
      ? {
          top: chrome.topInsetColor,
          bottom: chrome.bottomInsetColor,
        }
      : undefined;

  return (
    <DrawerChromeContext.Provider value={contextValue}>
      <AppSafeArea
        edges={Platform.OS === 'web' ? WEB_SHELL_EDGES : NATIVE_SHELL_EDGES}
        edgeBackgroundColors={edgeBackgroundColors}>
        {children}
      </AppSafeArea>
    </DrawerChromeContext.Provider>
  );
}

export function useDrawerChrome() {
  const context = useContext(DrawerChromeContext);
  if (!context) {
    throw new Error('useDrawerChrome must be used inside DrawerChromeProvider');
  }
  return context;
}

/** No-op outside native app shell (e.g. tests). */
export function useOptionalDrawerChrome() {
  return useContext(DrawerChromeContext);
}

export const isDrawerChromeSupported = Platform.OS !== 'web';
