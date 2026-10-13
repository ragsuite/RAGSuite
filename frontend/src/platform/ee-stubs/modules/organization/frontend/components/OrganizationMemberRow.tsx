import { FolderKanban, UserMinus } from 'lucide-react-native';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { OrgUser } from '@/features/organization/types/organization.types';
import { ORG_MEMBERS_TABLE } from '@/features/organization/utils/organization-members-table';
import { useTranslation } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const AVATAR_SIZE = 32;

function memberInitial(user: OrgUser): string {
  const fromUsername = user.username?.trim();
  if (fromUsername) return fromUsername.charAt(0).toUpperCase();
  const fromEmail = user.email?.trim();
  if (fromEmail) return fromEmail.charAt(0).toUpperCase();
  return '?';
}

type Props = {
  user: OrgUser;
  isLast?: boolean;
  disableDeactivate?: boolean;
  disableDelete?: boolean;
  /** When false, hide project ACL action (CE — Enterprise-locked). Default true. */
  showAssignProjects?: boolean;
  onEdit: () => void;
  onAssignProjects?: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
};

export function OrganizationMemberRow({
  user,
  isLast,
  disableDeactivate = false,
  disableDelete = false,
  showAssignProjects = true,
  onEdit,
  onAssignProjects,
  onDeactivate,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, radius, surfaceRadius, elevation } = useAppTheme();
  const isNativeMobile = Platform.OS !== 'web';

  const roleLabel = user.role === 'org_admin' ? t('org.members.role.orgAdmin') : t('org.members.role.member');
  const statusLabel = !user.isActive
    ? t('org.members.status.inactive')
    : user.inviteStatus === 'pending'
      ? t('org.members.status.pending')
      : t('org.members.status.active');
  const initial = memberInitial(user);
  const avatarUrl = user.avatar?.trim() || null;

  const avatar = avatarUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
      }}
      contentFit="cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  ) : (
    <View
      style={[
        styles.avatar,
        {
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          backgroundColor: colors.primaryTint,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>{initial}</Text>
    </View>
  );

  const actions = (
    <>
      <IconBtn label={t('org.members.a11y.edit')} onPress={onEdit} icon={ActionIcons.edit} boxed={isNativeMobile} />
      {showAssignProjects && user.role !== 'org_admin' && onAssignProjects ? (
        <IconBtn
          label={t('org.members.a11y.projects')}
          onPress={onAssignProjects}
          icon={FolderKanban}
          boxed={isNativeMobile}
        />
      ) : null}
      {user.isActive ? (
        <IconBtn
          label={t('org.members.a11y.deactivate')}
          onPress={onDeactivate}
          icon={UserMinus}
          destructive
          disabled={disableDeactivate}
          boxed={isNativeMobile}
        />
      ) : (
        <IconBtn
          label={t('org.members.a11y.delete')}
          onPress={onDelete}
          icon={ActionIcons.delete}
          destructive
          disabled={disableDelete}
          boxed={isNativeMobile}
        />
      )}
    </>
  );

  if (isNativeMobile) {
    return (
      <View
        style={[
          styles.card,
          elevation.card,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surface,
            padding: spacing.sm,
            gap: spacing.xs,
          },
        ]}>
        <View style={[styles.cardIdentity, { gap: spacing.sm }]}>
          {avatar}
          <View style={styles.identityText}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
              {user.username}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        </View>
        <View style={[styles.cardMeta, { gap: spacing.xs }]}>
        <View style={[styles.badgeRow, { gap: spacing.xs }]}>
          <View style={[styles.badge, { backgroundColor: colors.primaryTint, borderRadius: radius.pill }]}>
            <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>{roleLabel}</Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: user.isActive ? colors.primaryTint : colors.surfaceMuted,
                borderRadius: radius.pill,
              },
            ]}>
            <Text style={[typography.caption, { color: user.isActive ? colors.success : colors.textMuted }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.cardActions, { gap: spacing.xs }]}>{actions}</View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          gap: ORG_MEMBERS_TABLE.rowGap,
        },
      ]}>
      <View style={[styles.identity, { gap: spacing.sm }]}>
        {avatar}
        <View style={styles.identityText}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
            {user.username}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
      </View>
      <View style={styles.roleCell}>
        <View style={[styles.badge, { backgroundColor: colors.primaryTint, borderRadius: radius.pill }]}>
          <Text style={[typography.caption, { color: colors.primary, fontWeight: '500' }]}>{roleLabel}</Text>
        </View>
      </View>
      <View style={styles.statusCell}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: user.isActive ? colors.primaryTint : colors.surfaceMuted,
              borderRadius: radius.pill,
            },
          ]}>
          <Text style={[typography.caption, { color: user.isActive ? colors.success : colors.textMuted }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.actionsCell}>
        <View style={[styles.actions, { gap: spacing.xs }]}>{actions}</View>
      </View>
    </View>
  );
}

function IconBtn({
  label,
  onPress,
  icon: Icon,
  destructive,
  disabled,
  boxed = false,
}: {
  label: string;
  onPress: () => void;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  boxed?: boolean;
}) {
  const { colors, surfaceRadius } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        boxed ? styles.boxedBtn : styles.iconBtn,
        boxed
          ? {
              borderColor: destructive ? colors.danger : colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: colors.surface,
            }
          : null,
        disabled ? styles.iconBtnDisabled : null,
      ]}>
      <Icon size={16} color={disabled ? colors.textMuted : destructive ? colors.danger : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identity: {
    flex: ORG_MEMBERS_TABLE.identityFlex,
    minWidth: ORG_MEMBERS_TABLE.identityMinWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  roleCell: {
    width: ORG_MEMBERS_TABLE.roleWidth,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCell: {
    width: ORG_MEMBERS_TABLE.statusWidth,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsCell: {
    width: ORG_MEMBERS_TABLE.actionsWidth,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderWidth: 1,
  },
  cardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flexShrink: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  iconBtn: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxedBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.45,
  },
});
