import React from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

import {
  useThemedScrollViewProps,
  type ThemedScrollbarVariant,
} from '@/shared/utils/themed-scrollbar';

export type AppScrollViewRef = React.ElementRef<typeof ScrollView>;

export type AppScrollViewProps = ScrollViewProps & {
  scrollbarVariant?: ThemedScrollbarVariant;
};

export const AppScrollView = React.forwardRef<ScrollView, AppScrollViewProps>(
  function AppScrollView(
    {
      scrollbarVariant = 'screen',
      style,
      horizontal,
      /** Keep keyboard open while tapping/scrolling lists (search, sheets, pickers). */
      keyboardShouldPersistTaps = 'always',
      /** Do not dismiss keyboard when dragging the scroll view. */
      keyboardDismissMode = 'none',
      automaticallyAdjustKeyboardInsets = Platform.OS === 'ios' && !horizontal,
      ...rest
    },
    ref,
  ) {
    const { style: scrollbarStyle, ...themedProps } = useThemedScrollViewProps(scrollbarVariant);

    return (
      <ScrollView
        ref={ref}
        horizontal={horizontal}
        {...rest}
        {...themedProps}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        style={[style, scrollbarStyle]}
      />
    );
  },
);

AppScrollView.displayName = 'AppScrollView';
