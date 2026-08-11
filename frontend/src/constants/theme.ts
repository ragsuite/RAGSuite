/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1A17',
    background: '#F4F1EA',
    backgroundElement: '#EDE8DC',
    backgroundSelected: '#E7EDE7',
    textSecondary: '#57544C',
  },
  dark: {
    text: '#FBFAF6',
    background: '#16271F',
    backgroundElement: '#1E3A30',
    backgroundSelected: '#1E3A30',
    textSecondary: '#DED7C7',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** @deprecated Use `useAppTheme().fonts` from `@/shared/hooks/use-app-theme` — brand fonts are loaded via `useBrandFonts`. */

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
