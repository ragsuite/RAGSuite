import { Platform } from 'react-native';

export const SEARCH_CONFIG_COMPACT_BREAKPOINT = 900;

export function isSearchConfigWebPlatform(): boolean {
  return Platform.OS === 'web';
}

export function isSearchConfigCompactWidth(width: number): boolean {
  return width < SEARCH_CONFIG_COMPACT_BREAKPOINT;
}
