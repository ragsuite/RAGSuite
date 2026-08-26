import { LogOut, Settings, UserRound } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { hrefForAppRoute } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { AdaptivePopover, type PopoverAnchor } from '@/shared/components/adaptive/adaptive-popover';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';

const MENU_WIDTH = 320;

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  if (parsed.length !== 6) return hex;
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getInitial(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

type AvatarCircleProps = {
  initial: string;
  size: number;
  fontSize?: number;
  avatarUrl?: string | null;
};

function AvatarCircle({ initial, size, fontSize, avatarUrl }: AvatarCircleProps) {
  const { colors, typography } = useAppTheme();
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primaryTint,
        },
      ]}>
      <Text style={[typography.body, { color: colors.primary, fontSize: fontSize ?? size * 0.4 }]}>
        {initial}
      </Text>
    </View>
  );
}

type ProfileMenuContentProps = {
  onClose: () => void;
};

function ProfileMenuContent({ onClose }: ProfileMenuContentProps) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { session, signOut } = useSession();
  const { canAccessRoute } = useActiveProject();
  const { profile } = useUserProfileSummary();
  const router = useRouter();
  const showProfile = canAccessRoute('profile');
  const showSettings = canAccessRoute('settings');

  const user = session?.user;
  const displayName = profile?.user.name ?? user?.fullName ?? t('profile.defaultUser');
  const email = profile?.user.email ?? user?.email ?? '';
  const role =
    profile?.user.role ??
    (user?.isAdmin ? t('profile.badge.admin') : t('profile.badge.user'));
  const initial = getInitial(displayName);
  const avatarUrl = profile?.user.avatar;

  const handleNavigate = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const handleSignOut = useCallback(async () => {
    // Close popover Modal first so its dismiss layer cannot steal the next click.
    onClose();
    const confirmed = await confirm({
      title: t('userMenu.signOutConfirm.title'),
      message: t('userMenu.signOutConfirm.message'),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('userMenu.signOut'),
      destructive: true,
      dimBackdrop: true,
    });
    if (!confirmed) return;
    await signOut();
  }, [confirm, onClose, signOut, t]);

  return (
    <View style={styles.menuContent}>
      <View style={[styles.profileHeader, { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
        <AvatarCircle initial={initial} size={48} fontSize={18} avatarUrl={avatarUrl} />
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[typography.body, styles.displayName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={[styles.roleBadge, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
              <Text style={[typography.caption, styles.roleText, { color: colors.textMuted }]}>{role}</Text>
            </View>
          </View>
          <Text style={[typography.caption, styles.email, { color: colors.textMuted }]} numberOfLines={1}>
            {email}
          </Text>
        </View>
      </View>

      {(showProfile || showSettings) ? (
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
        <NavGroupLabel style={{ color: colors.textMuted }}>{t('userMenu.accountLabel')}</NavGroupLabel>
      </View>
      ) : null}

      {showProfile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.title')}
          onPress={() => handleNavigate(hrefForAppRoute('profile'))}
          style={({ pressed, hovered }) => [
            styles.menuRow,
            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
            pressed ? { backgroundColor: colors.surfaceMuted } : hovered ? { backgroundColor: colors.surfaceHover } : null,
          ]}>
          <UserRound size={16} strokeWidth={2} color={colors.textMuted} />
          <View style={styles.menuRowText}>
            <Text style={[typography.body, styles.menuRowTitle, { color: colors.text }]}>{t('profile.title')}</Text>
            <Text style={[typography.caption, styles.menuRowSubtitle, { color: colors.textMuted }]}>{t('userMenu.profileDescription')}</Text>
          </View>
        </Pressable>
      ) : null}

      {showSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          onPress={() => handleNavigate(hrefForAppRoute('settings'))}
          style={({ pressed, hovered }) => [
            styles.menuRow,
            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
            pressed ? { backgroundColor: colors.surfaceMuted } : hovered ? { backgroundColor: colors.surfaceHover } : null,
          ]}>
          <Settings size={16} strokeWidth={2} color={colors.textMuted} />
          <View style={styles.menuRowText}>
            <Text style={[typography.body, styles.menuRowTitle, { color: colors.text }]}>{t('settings.title')}</Text>
            <Text style={[typography.caption, styles.menuRowSubtitle, { color: colors.textMuted }]}>{t('userMenu.settingsDescription')}</Text>
          </View>
        </Pressable>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.xs }]} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('userMenu.signOut')}
        onPress={() => void handleSignOut()}
        style={({ pressed, hovered }) => [
          styles.menuRow,
          { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
          pressed ? { backgroundColor: colors.surfaceMuted } : hovered ? { backgroundColor: colors.surfaceHover } : null,
        ]}>
        <LogOut size={16} strokeWidth={2} color={colors.danger} />
        <Text style={[typography.body, styles.signOutText, { color: colors.danger }]}>{t('userMenu.signOut')}</Text>
      </Pressable>
    </View>
  );
}

type Props = {
  controlSize?: number;
};

export function UserProfileMenu({ controlSize = 40 }: Props) {
  const { colors, spacing, typography, surfaceRadius, mode } = useAppTheme();
  const { t } = useTranslation();
  const { session } = useSession();
  const { profile } = useUserProfileSummary();
  const router = useRouter();
  const anchorRef = useRef<View>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  const displayName = profile?.user.name ?? session?.user?.fullName ?? session?.user?.email ?? 'User';
  const initial = getInitial(displayName);
  const avatarUrl = profile?.user.avatar;
  const isWeb = Platform.OS === 'web';
  const isDark = mode === 'dark';
  const avatarSize = Math.max(24, controlSize - 12);
  const chromeBorderColor = isDark ? colors.border : hexToRgba(colors.primary, 0.16);
  const chromeBackground = isDark ? hexToRgba(colors.primary, 0.12) : hexToRgba(colors.primary, 0.07);
  const chromeBackgroundPressed = isDark ? hexToRgba(colors.primary, 0.2) : hexToRgba(colors.primary, 0.14);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ top: y, left: x, width, height });
      setMenuOpen(true);
    });
  }, []);

  const handlePress = useCallback(() => {
    if (isWeb) {
      openMenu();
      return;
    }
    router.push(hrefForAppRoute('profile'));
  }, [isWeb, openMenu, router]);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isWeb ? `Open profile menu for ${displayName}` : t('profile.title')
          }
          accessibilityState={isWeb ? { expanded: menuOpen } : undefined}
          onPress={handlePress}
          style={({ pressed, focused }) => [
            styles.trigger,
            isWeb ? styles.triggerWeb : styles.triggerMobile,
            isWeb
              ? {
                  height: controlSize,
                  minHeight: controlSize,
                  maxHeight: controlSize,
                  borderRadius: surfaceRadius.button,
                  borderColor: chromeBorderColor,
                  backgroundColor: pressed ? chromeBackgroundPressed : chromeBackground,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 0,
                  gap: spacing.xs,
                }
              : { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
            isWeb ? focusRingStyle(focused, colors.primary) : null,
          ]}>
          <View
            style={[
              styles.triggerAvatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                overflow: 'hidden',
                backgroundColor: colors.primaryTint,
              },
            ]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: avatarSize, height: avatarSize }} contentFit="cover" />
            ) : (
              <Text style={[typography.caption, { color: colors.primary, fontSize: avatarSize * 0.42 }]}>
                {initial}
              </Text>
            )}
          </View>
          {isWeb ? (
            <Text style={[typography.caption, styles.triggerName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {isWeb ? (
        <AdaptivePopover
          visible={menuOpen}
          onClose={closeMenu}
          anchor={menuAnchor}
          popoverWidth={MENU_WIDTH}
          maxHeight={400}
          title={t('profile.title')}
          contentStyle={{ paddingVertical: spacing.xs, borderRadius: surfaceRadius.modal }}>
          <ProfileMenuContent onClose={closeMenu} />
        </AdaptivePopover>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerWeb: {
    borderWidth: 1,
  },
  triggerMobile: {
    borderWidth: 0,
    padding: 0,
  },
  triggerAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  triggerName: {
    maxWidth: 112,
  },
  avatarCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuContent: {},
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  displayName: {
    flexShrink: 1,
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    flexShrink: 0,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  email: {
    lineHeight: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuRowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  menuRowTitle: {
    fontWeight: '500',
    fontSize: 14,
  },
  menuRowSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginHorizontal: 0,
  },
  signOutText: {
    fontWeight: '500',
    fontSize: 14,
  },
});
