import { Fingerprint, LogOut, Settings, UserRound } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useId, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getOrgAdminRouteAccess, hrefForAppRoute } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { AdaptivePopover, type PopoverAnchor } from '@/shared/components/adaptive/adaptive-popover';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { ProfileMenuRow } from '@/shared/components/navigation/profile-menu-row';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useOrgAdminNavAccess } from '@/shared/hooks/use-org-admin-nav-access';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import {
  formatSessionCountdown,
  SESSION_TIMEOUT_WARN_MS,
} from '@/features/auth/utils/session-countdown';

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
  const { session, signOut, sessionRemainingMs } = useSession();
  const { canAccessRoute } = useActiveProject();
  const { profile } = useUserProfileSummary();
  const router = useRouter();
  const showProfile = canAccessRoute('profile');
  const showSettings = canAccessRoute('settings');
  const ssoAccess = getOrgAdminRouteAccess('organization-sso', useOrgAdminNavAccess());

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
      variant: 'danger',
    });
    if (!confirmed) return;
    await signOut();
  }, [confirm, onClose, signOut, t]);

  return (
    <View style={styles.menuContent}>
      <View
        style={[
          styles.profileHeader,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderBottomColor: colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}>
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
          {sessionRemainingMs != null ? (
            <Text
              style={[
                typography.caption,
                {
                  color:
                    sessionRemainingMs <= SESSION_TIMEOUT_WARN_MS ? colors.danger : colors.textMuted,
                  fontVariant: ['tabular-nums'],
                  marginTop: 2,
                },
              ]}
              numberOfLines={1}>
              {t('userMenu.sessionRemaining', {
                time: formatSessionCountdown(sessionRemainingMs),
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {(showProfile || showSettings || ssoAccess.visible) ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
          <NavGroupLabel style={{ color: colors.textMuted }}>{t('userMenu.accountLabel')}</NavGroupLabel>
        </View>
      ) : null}

      {showProfile ? (
        <ProfileMenuRow
          icon={UserRound}
          title={t('profile.title')}
          description={t('userMenu.profileDescription')}
          onPress={() => handleNavigate(hrefForAppRoute('profile'))}
        />
      ) : null}

      {showSettings ? (
        <ProfileMenuRow
          icon={Settings}
          title={t('settings.title')}
          description={t('userMenu.settingsDescription')}
          onPress={() => handleNavigate(hrefForAppRoute('settings'))}
        />
      ) : null}

      {ssoAccess.visible ? (
        <ProfileMenuRow
          icon={Fingerprint}
          title={t('org.sso.title')}
          description={t('userMenu.ssoDescription')}
          enterpriseLocked={ssoAccess.enterpriseLocked}
          onPress={() => handleNavigate(hrefForAppRoute('organization-sso'))}
        />
      ) : null}

      <View style={[styles.signOutFooter, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('userMenu.signOut')}
          onPress={() => void handleSignOut()}
          style={({ pressed, hovered }) => [
            styles.menuRow,
            styles.signOutRow,
            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
            pressed
              ? { backgroundColor: colors.surfaceMuted }
              : hovered
                ? { backgroundColor: colors.surfaceHover }
                : null,
          ]}>
          <LogOut size={16} strokeWidth={2} color={colors.danger} />
          <Text style={[typography.body, styles.signOutText, { color: colors.danger }]}>
            {t('userMenu.signOut')}
          </Text>
        </Pressable>
      </View>
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
  const triggerId = useId().replace(/:/g, '');
  const anchorRef = useRef<View>(null);
  const menuOpenRef = useRef(false);

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
    menuOpenRef.current = false;
    setMenuOpen(false);
    setMenuAnchor(null);
  }, []);

  const openMenu = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ top: y, left: x, width, height });
      menuOpenRef.current = true;
      setMenuOpen(true);
    });
  }, []);

  const handlePress = useCallback(() => {
    if (isWeb) {
      if (menuOpenRef.current) {
        closeMenu();
        return;
      }
      openMenu();
      return;
    }
    router.push(hrefForAppRoute('profile'));
  }, [closeMenu, isWeb, openMenu, router]);

  return (
    <>
      <View ref={anchorRef} collapsable={false} nativeID={`popover-trigger-${triggerId}`}>
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
          anchorRef={anchorRef}
          triggerId={triggerId}
          popoverWidth={MENU_WIDTH}
          lockWidth
          maxHeight={400}
          blocking={false}
          title={t('profile.title')}
          contentStyle={styles.popoverContent}>
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
  menuContent: {
    width: '100%',
    overflow: 'hidden',
  },
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
  signOutFooter: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  signOutRow: {
    width: '100%',
  },
  signOutText: {
    fontWeight: '500',
    fontSize: 14,
  },
  popoverContent: {
    width: '100%',
    overflow: 'hidden',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
});
