import React from 'react';
import { FlatList, Platform } from 'react-native';

import { AppFlatList, type AppFlatListProps } from '@/shared/components/app-flat-list';

export type AppPaginatedFlatListProps<ItemT> = AppFlatListProps<ItemT> & {
  dataVersion?: number;
};

function AppPaginatedFlatListInner<ItemT>(
  { dataVersion, ...rest }: AppPaginatedFlatListProps<ItemT>,
  ref: React.ForwardedRef<FlatList<ItemT>>,
) {
  return (
    <AppFlatList
      ref={ref}
      {...rest}
      extraData={dataVersion}
      disableVirtualization={Platform.OS === 'web'}
      removeClippedSubviews={Platform.OS !== 'web'}
    />
  );
}

export const AppPaginatedFlatList = React.forwardRef(AppPaginatedFlatListInner) as <ItemT>(
  props: AppPaginatedFlatListProps<ItemT> & { ref?: React.ForwardedRef<FlatList<ItemT>> },
) => React.ReactElement | null;
