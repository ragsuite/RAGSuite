import { AlertCircle, AlertTriangle, Check, Info } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { formatNotificationTime } from '@/features/notifications/services/notification.service';
import type { Notification, NotificationType } from '@/features/notifications/types/notification.types';
import { useTranslation } from '@/i18n';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type AppTheme = ReturnType<typeof useAppTheme>;

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  info: Info,
  success: Check,
  warning: AlertTriangle,
  error: AlertCircle,
};

function typeBadgeLabel(t: (key: string) => string, type: NotificationType): { label: string; filled?: boolean } {
  if (type === 'success') return { label: t('notifications.filters.type.success'), filled: true };
  if (type === 'warning') return { label: t('notifications.filters.type.warning') };
  if (type === 'error') return { label: t('notifications.filters.type.error') };
  return { label: t('notifications.filters.type.info') };
}

type Props = {
  item: Notification;
  onPress: () => void;
  onDelete: () => void;
};

type RowContentProps = {
  item: Notification;
  onDeleteFromChrome: () => void;
  colors: AppTheme['colors'];
  typography: AppTheme['typography'];
  surfaceRadius: AppTheme['surfaceRadius'];
  translate: (key: string) => string;
};

function tokenForType(
  notificationType: NotificationType,
  colors: AppTheme['colors'],
): { iconBg: string; iconFg: string } {
  if (notificationType === 'success') return { iconBg: colors.primaryTint, iconFg: colors.success };
  if (notificationType === 'warning') return { iconBg: colors.ochreTint, iconFg: colors.warning };
  if (notificationType === 'error') return { iconBg: colors.dangerBackground, iconFg: colors.danger };
  return { iconBg: colors.primaryTint, iconFg: colors.primary };
}

function RowContent({ item, onDeleteFromChrome, colors, typography, surfaceRadius, translate }: RowContentProps) {
  const Icon = TYPE_ICON[item.type] ?? Info;
  const { iconBg, iconFg } = tokenForType(item.type, colors);
  const titleWeight: '500' = '500';
  const unread = !item.isRead;
  const badge = typeBadgeLabel(translate, item.type);
  const cardBg = unread ? colors.primaryTint : colors.surface;
  const cardBorder = unread ? colors.borderStrong : colors.border;
  const successBadgeFill = colors.success;
  const filled = badge.filled;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderWidth: 1,
          borderRadius: surfaceRadius.card,
        },
      ]}>
      <View
        style={[
          styles.typeIcon,
          { backgroundColor: iconBg, borderRadius: surfaceRadius.button, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
        ]}>
        <Icon size={17} color={iconFg} strokeWidth={2.2} />
      </View>

      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[typography.cardTitle, { color: colors.text, fontWeight: titleWeight, flex: 1, fontSize: 15, lineHeight: 20 }]}>
            {item.title}
          </Text>
          {unread ? <View style={[styles.unreadPip, { backgroundColor: colors.primary }]} accessibilityLabel="Unread" /> : null}
          <Pressable
            onPress={onDeleteFromChrome}
            hitSlop={8}
            style={({ pressed }) => [
              styles.trashButton,
              {
                borderColor: colors.danger,
                backgroundColor: pressed ? colors.danger : 'transparent',
                opacity: pressed ? 0.95 : 1,
                borderRadius: surfaceRadius.button,
              },
            ]}
            accessibilityLabel={translate('common.delete')}>
            {({ pressed }) => <ActionIcons.delete size={16} color={pressed ? colors.textOnPrimary : colors.danger} />}
          </Pressable>
        </View>
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[typography.caption, { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
          {item.message}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12 }]}>{formatNotificationTime(item.createdAt)}</Text>
          <View
            style={[
              styles.pill,
              {
                backgroundColor: filled ? successBadgeFill : colors.surface,
                borderColor: filled ? successBadgeFill : colors.border,
                borderWidth: 1,
                borderRadius: 999,
                paddingVertical: 2,
                paddingHorizontal: 7,
              },
            ]}>
            <Text
              style={[
                typography.caption,
                { color: filled ? colors.textOnPrimary : colors.text, fontWeight: '500', fontSize: 11 },
              ]}>
              {badge.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const NotificationItem = React.memo(function NotificationItem({ item, onPress, onDelete }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { colors, typography, elevation, surfaceRadius } = theme;
  const isWeb = Platform.OS === 'web';
  const swipeRef = useRef<Swipeable | null>(null);
  const [hovered, setHovered] = useState(false);

  const confirmDelete = useCallback(
    (then: () => void) => {
      void (async () => {
        const confirmed = await confirm({
          title: t('notifications.confirm.delete.title'),
          message: t('notifications.confirm.delete.message'),
          cancelLabel: t('common.cancel'),
          confirmLabel: t('common.delete'),
          destructive: true,
        });
        if (!confirmed) return;
        then();
      })();
    },
    [confirm, t],
  );

  const onDeleteFromChrome = useCallback(() => {
    confirmDelete(onDelete);
  }, [confirmDelete, onDelete]);

  const renderRight = useCallback(() => {
    return (
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          confirmDelete(onDelete);
        }}
        style={({ pressed }) => [
          styles.deletePane,
          {
            backgroundColor: colors.danger,
            alignSelf: 'stretch',
            opacity: pressed ? 0.92 : 1,
            borderTopRightRadius: surfaceRadius.button,
            borderBottomRightRadius: surfaceRadius.button,
            minWidth: 88,
          },
        ]}>
        <View style={styles.deleteInner}>
          <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '500' }]}>{t('common.delete')}</Text>
        </View>
      </Pressable>
    );
  }, [colors.danger, colors.textOnPrimary, confirmDelete, onDelete, surfaceRadius.button, t, typography.subtitle]);

  const body = (
    <Pressable
      onPress={onPress}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      style={({ pressed }) => [
        { borderRadius: surfaceRadius.card, marginBottom: 0 },
        !isWeb && pressed ? { opacity: 0.98 } : null,
        isWeb && hovered ? elevation.card : null,
      ]}>
      <RowContent
        item={item}
        onDeleteFromChrome={onDeleteFromChrome}
        colors={colors}
        typography={typography}
        surfaceRadius={surfaceRadius}
        translate={t}
      />
    </Pressable>
  );

  if (isWeb) {
    return <View style={styles.wrap}>{body}</View>;
  }

  return (
    <View style={styles.wrap}>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRight}
        overshootRight={false}
        friction={2}
        enableTrackpadTwoFingerGesture
        childrenContainerStyle={{ backgroundColor: 'transparent', borderRadius: surfaceRadius.card }}>
        {body}
      </Swipeable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    gap: 8,
  },
  typeIcon: {},
  middle: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadPip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 0,
  },
  trashButton: {
    marginLeft: 2,
    width: 26,
    height: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pill: {
    flexShrink: 0,
  },
  deletePane: {
    justifyContent: 'center',
  },
  deleteInner: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
});
