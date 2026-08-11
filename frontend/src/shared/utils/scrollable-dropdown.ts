import { Platform, type FlatListProps, type ViewStyle } from 'react-native';

import { getWebScrollbarStyle } from '@/shared/utils/themed-scrollbar';

export const SCROLLABLE_DROPDOWN_MAX_HEIGHT = 240;

type ScrollableDropdownConfig = {
  maxHeight?: number;
  /** Enable type-to-filter when lists can grow (e.g. projects). */
  search?: boolean;
  searchPlaceholder?: string;
  themeMode?: 'light' | 'dark';
};

export function scrollableDropdownConfig(options: ScrollableDropdownConfig = {}) {
  const maxHeight = options.maxHeight ?? SCROLLABLE_DROPDOWN_MAX_HEIGHT;
  const webScrollbarStyle =
    options.themeMode != null ? getWebScrollbarStyle(options.themeMode, 'screen') : undefined;

  return {
    maxHeight,
    inverted: false as const,
    dropdownPosition: 'auto' as const,
    showsVerticalScrollIndicator: true,
    search: options.search ?? false,
    searchPlaceholder: options.searchPlaceholder,
    flatListProps: {
      nestedScrollEnabled: true,
      scrollEnabled: true,
      keyboardShouldPersistTaps: 'always' as const,
      keyboardDismissMode: 'none' as const,
      initialNumToRender: 16,
      style: { maxHeight: maxHeight - 2, ...webScrollbarStyle },
    } satisfies Partial<FlatListProps<unknown>>,
  };
}

export function scrollableDropdownContainerStyle(
  base: ViewStyle | ViewStyle[],
  maxHeight = SCROLLABLE_DROPDOWN_MAX_HEIGHT,
): ViewStyle[] {
  const merged = Array.isArray(base) ? base : [base];
  return [
    ...merged,
    {
      maxHeight,
      ...(Platform.OS === 'web' ? { overflow: 'scroll' as const } : { overflow: 'hidden' as const }),
    },
  ];
}
