import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { AppFlatList } from '@/shared/components/app-flat-list';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NotificationFilter } from '@/features/notifications/components/NotificationFilter';
import { NotificationHeader } from '@/features/notifications/components/NotificationHeader';
import { NotificationItem } from '@/features/notifications/components/NotificationItem';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import type { Notification } from '@/features/notifications/types/notification.types';
import { hrefFromActionUrl } from '@/features/notifications/utils/notification-href';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  mode?: 'screen' | 'sheet';
  onRequestClose?: () => void;
};

export function NotificationScreen({ mode = 'screen', onRequestClose }: Props) {
  const theme = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();
  const { colors, spacing } = theme;
  const isWeb = Platform.OS === 'web';
  const router = useRouter();
  const appShell = useAppShell();

  const {
    items,
    visibleNotifications,
    loading,
    refreshing,
    error,
    readFilter,
    setReadFilter,
    typeFilter,
    setTypeFilter,
    unreadCount,
    markAllAsRead,
    deleteAll,
    deleteOne,
    handleRowPress,
    reload,
    refresh,
  } = useNotifications();
  const showIntroHeader = isWeb || mode === 'sheet';
  const showTopControls = isWeb || mode === 'sheet' || appShell.isNotificationsFiltersOpen;

  const onClose = useCallback(() => {
    appShell.closeNotificationsFilters();
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    if (router.canGoBack()) router.back();
  }, [appShell, onRequestClose, router]);

  const emptyLabel = useMemo(() => t('notifications.empty'), [t]);

  const listIsEmpty = !loading && !error && visibleNotifications.length === 0;

  const onPressItem = useCallback(
    (item: Notification) => {
      appShell.closeNotificationsFilters();
      handleRowPress(item);
      if (item.actionUrl) {
        const href = hrefFromActionUrl(item.actionUrl);
        try {
          router.push(href);
        } catch {
          // ignore invalid href in dev; surface in logs if needed
        }
      }
      if (mode === 'sheet') {
        onRequestClose?.();
      }
    },
    [appShell, handleRowPress, mode, onRequestClose, router],
  );

  const onDeleteAll = useCallback(() => {
    if (items.length === 0) return;
    void deleteAll();
  }, [deleteAll, items.length]);

  const onMarkAllRead = useCallback(() => {
    if (unreadCount === 0) return;
    void markAllAsRead();
  }, [markAllAsRead, unreadCount]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => {
      return (
        <NotificationItem
          item={item}
          onPress={() => onPressItem(item)}
          onDelete={() => void deleteOne(item.id)}
        />
      );
    },
    [deleteOne, onPressItem],
  );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: mode === 'sheet' ? colors.surface : colors.background,
            paddingTop: isWeb && mode === 'sheet' ? 14 : 6,
            paddingHorizontal: mode === 'sheet' ? 0 : 16,
          },
        ]}>
        {showIntroHeader ? (
          <View style={mode === 'sheet' ? { paddingHorizontal: 16 } : null}>
            <NotificationHeader
              unreadCount={unreadCount}
              onClose={onClose}
              variant={mode === 'sheet' ? 'compact' : 'page'}
            />
          </View>
        ) : null}

        {showTopControls ? <View style={{ height: spacing.sm }} /> : null}

        {showTopControls ? (
          <View style={mode === 'sheet' ? { paddingHorizontal: 16 } : null}>
            <NotificationFilter readFilter={readFilter} onReadFilterChange={setReadFilter} typeFilter={typeFilter} onTypeFilterChange={setTypeFilter} />
          </View>
        ) : null}

        {!loading && items.length > 0 && showTopControls ? (
          <View style={[styles.bulk, { marginTop: spacing.md }, mode === 'sheet' ? { paddingHorizontal: 16 } : null]}>
            <View style={styles.bulkBtnWrap}>
              <AppButton
                label={t('notifications.actions.markAllAsRead')}
                onPress={onMarkAllRead}
                disabled={unreadCount === 0}
                variant="outline"
                size="compact"
                fullWidth
              />
            </View>
            <View style={styles.bulkBtnWrap}>
              <AppButton
                label={t('notifications.actions.deleteAll')}
                onPress={onDeleteAll}
                disabled={items.length === 0}
                icon={ActionIcons.delete}
                variant="danger"
                size="compact"
                fullWidth
              />
            </View>
          </View>
        ) : null}

        {!isWeb && mode === 'screen' ? <View style={{ height: spacing.xs }}/> : <View style={{ height: spacing.sm }} />}

        <StatePanel
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={listIsEmpty}
          emptyLabel={emptyLabel}>
          <AppFlatList
            data={visibleNotifications}
            keyExtractor={(n) => n.id}
            renderItem={renderItem}
            scrollbarVariant={mode === 'sheet' ? 'overlay' : 'screen'}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingBottom: scrollBottomPadding,
                paddingTop: 4,
                paddingHorizontal: mode === 'sheet' ? 16 : 0,
                ...(isWeb && mode !== 'sheet'
                  ? {
                      maxWidth: 632,
                      alignSelf: 'center' as const,
                      width: '100%',
                      paddingRight: 16,
                    }
                  : null),
              },
            ]}
            refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === 'android'}
            scrollIndicatorInsets={isWeb ? undefined : { right: 0 }}
            windowSize={10}
            initialNumToRender={10}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        </StatePanel>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    paddingTop: 6,
  },
  bulk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bulkBtnWrap: {
    flex: 1,
    minWidth: 140,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
});
