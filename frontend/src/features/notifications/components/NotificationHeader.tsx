import { Bell, X } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  unreadCount: number;
  onClose: () => void;
  /** Sheet drawer uses compact title; full screen uses page title on web. */
  variant?: 'page' | 'compact';
};

export function NotificationHeader({ unreadCount, onClose, variant = 'compact' }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const isWeb = Platform.OS === 'web';
  const isCompact = variant === 'compact' || !isWeb;

  return (
    <View
      style={{
        width: '100%',
        paddingBottom: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}>
      <PageSectionHeader
        variant={isCompact ? 'compact' : 'page'}
        title={t('notifications.title')}
        subtitle={t('notifications.description')}
        leading={<Bell size={isCompact ? 20 : 24} color={colors.text} strokeWidth={2} />}
        titleAddon={
          unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.danger, borderRadius: surfaceRadius.button }]}>
              <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '500', fontSize: 12 }]}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          ) : null
        }
        action={
          <Pressable
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 28,
    paddingHorizontal: 6,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
