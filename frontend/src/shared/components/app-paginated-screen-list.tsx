import React from 'react';
import {
  Platform,
  View,
  type ListRenderItem,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppPaginatedFlatList } from '@/shared/components/app-paginated-flat-list';
import { AppScrollView } from '@/shared/components/app-scroll-view';

export type AppPaginatedScreenListProps<ItemT> = {
  data: readonly ItemT[];
  dataVersion?: number;
  keyExtractor: (item: ItemT, index: number) => string;
  renderItem: ListRenderItem<ItemT>;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  ItemSeparatorComponent?: React.ComponentType | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps> | null;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  listHeaderStyle?: StyleProp<ViewStyle>;
};

const WEB_SEPARATORS = {
  highlight: () => undefined,
  unhighlight: () => undefined,
  updateProps: () => undefined,
};

export function AppPaginatedScreenList<ItemT>({
  data,
  dataVersion,
  keyExtractor,
  renderItem,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  contentContainerStyle,
  style,
  refreshControl,
  keyboardShouldPersistTaps = 'handled',
  listHeaderStyle,
}: AppPaginatedScreenListProps<ItemT>) {
  if (Platform.OS === 'web') {
    const Separator = ItemSeparatorComponent;

    return (
      <AppScrollView
        style={style}
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl ?? undefined}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
        {ListHeaderComponent ? <View style={listHeaderStyle}>{ListHeaderComponent}</View> : null}
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) => {
              const element = renderItem({ item, index, separators: WEB_SEPARATORS });
              if (!element) return null;
              const key = keyExtractor(item, index);
              return (
                <React.Fragment key={key}>
                  {index > 0 && Separator ? <Separator /> : null}
                  {element}
                </React.Fragment>
              );
            })}
        {data.length > 0 ? ListFooterComponent : null}
      </AppScrollView>
    );
  }

  return (
    <AppPaginatedFlatList
      style={style}
      data={[...data]}
      dataVersion={dataVersion ?? data.length}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeaderComponent}
      ListHeaderComponentStyle={listHeaderStyle}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      ItemSeparatorComponent={ItemSeparatorComponent ?? undefined}
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControl ?? undefined}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    />
  );
}
