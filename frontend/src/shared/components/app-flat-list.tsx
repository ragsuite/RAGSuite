import React from 'react';
import { FlatList, type FlatListProps } from 'react-native';

import {
  useThemedScrollViewProps,
  type ThemedScrollbarVariant,
} from '@/shared/utils/themed-scrollbar';

export type AppFlatListProps<ItemT> = FlatListProps<ItemT> & {
  scrollbarVariant?: ThemedScrollbarVariant;
};

function AppFlatListInner<ItemT>(
  {
    style,
    scrollbarVariant = 'screen',
    keyboardShouldPersistTaps = 'always',
    keyboardDismissMode = 'none',
    ...rest
  }: AppFlatListProps<ItemT>,
  ref: React.ForwardedRef<FlatList<ItemT>>,
) {
  const { style: scrollbarStyle, ...themedProps } = useThemedScrollViewProps(scrollbarVariant);

  return (
    <FlatList
      ref={ref}
      {...rest}
      {...themedProps}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      style={[style, scrollbarStyle]}
    />
  );
}

export const AppFlatList = React.forwardRef(AppFlatListInner) as <ItemT>(
  props: AppFlatListProps<ItemT> & { ref?: React.ForwardedRef<FlatList<ItemT>> },
) => React.ReactElement | null;
