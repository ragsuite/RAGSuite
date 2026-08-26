import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { getDrawerStatusFromState } from '@react-navigation/drawer';
import { useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogOut } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProductEdition } from '@/config/product-edition';
import { brandTokens } from '@/theme/brand-tokens';
import { activeRouteFromSegments, hrefForAppRoute, type AppRouteName } from '@/config/navigation';
import { useSession } from '@/features/auth/providers/session-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';
import { useLocalizedDrawerNav } from '@/i18n/use-localized-navigation';
import { useTranslation } from '@/i18n';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { EditionBadge } from '@/shared/components/brand';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { DrawerPreferencesSection } from '@/shared/components/navigation/drawer-preferences-section';
import { DrawerSection } from '@/shared/components/navigation/drawer-section';
import { isDrawerChromeSupported, useOptionalDrawerChrome } from '@/shared/components/navigation/drawer-chrome-provider';
import { ProjectSwitcher } from '@/shared/components/navigation/project-switcher';
import { SidebarOnlineBadge } from '@/shared/components/navigation/sidebar-online-badge';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { AppScrollView } from '@/shared/components/app-scroll-view';

type Props = DrawerContentComponentProps & {
  onSignOut: () => void;
  collapsed?: boolean;
};

export function AppDrawer({ navigation, state, onSignOut, collapsed = false }: Props) {
  const { colors, spacing, typography, surfaceRadius, radius, mode } = useAppTheme();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const isDrawerOpen =
    Platform.OS === 'web' || collapsed ? true : getDrawerStatusFromState(state) === 'open';
  const drawerChrome = useOptionalDrawerChrome();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { session } = useSession();
  const { profile } = useUserProfileSummary();
  const { canAccess: canAccessOrgAdmin, enterpriseModulesAvailable } = useOrgAdminAccess();
  const { canAccessRoute } = useActiveProject();
  const router = useRouter();
  const segments = useSegments();
  const activeRoute = activeRouteFromSegments(segments as string[]);
  const isOrgAdminUser =
    Boolean(session?.user.isAdmin) || profile?.user.role === 'Admin';
  const productEdition = getProductEdition({
    enterpriseAttached: enterpriseModulesAvailable,
  });
  const navSections = useLocalizedDrawerNav(Platform.OS === 'web', {
    isOrgAdmin: isOrgAdminUser && canAccessOrgAdmin,
    enterpriseModulesAvailable,
    canAccessRoute,
  });
  const sidebarBackground = colors.sidebar;
  const sidebarForeground = colors.sidebarForeground;
  const sidebarMuted = colors.iconMuted;
  const sidebarBorder = colors.border;
  const orgName = settings.branding.orgName.trim() || BRANDING_DEFAULTS.orgName;
  const logoDataUrl = settings.branding.logoDataUrl;
  const isNative = Platform.OS !== 'web';

  React.useEffect(() => {
    if (!isNative || !isDrawerChromeSupported || !drawerChrome) return;

    if (isDrawerOpen) {
      drawerChrome.setDrawerChrome({
        topInsetColor: sidebarBackground,
        bottomInsetColor: sidebarBackground,
      });
      return;
    }

    drawerChrome.setDrawerChrome({});
  }, [drawerChrome, isDrawerOpen, isNative, sidebarBackground]);

  React.useEffect(() => {
    return () => {
      drawerChrome?.setDrawerChrome({});
    };
  }, [drawerChrome]);

  const navigateTo = (route: AppRouteName) => {
    router.push(hrefForAppRoute(route));
    navigation.closeDrawer();
  };

  const closeDrawer = () => {
    navigation.closeDrawer();
  };

  return (
    <>
      {isNative && isDrawerOpen ? <StatusBar style={mode === 'dark' ? 'light' : 'dark'} animated /> : null}
      <View
        style={[
          styles.container,
          {
            backgroundColor: sidebarBackground,
            borderRightColor: colors.border,
            borderRightWidth: 1,
            paddingTop: isNative ? insets.top : 0,
            paddingBottom: isNative ? insets.bottom : 0,
          },
        ]}>
      <View
        style={[
          styles.header,
          collapsed ? styles.headerCollapsed : null,
          {
            padding: spacing.md,
            borderBottomColor: sidebarBorder,
          },
        ]}>
        {collapsed ? (
          <View style={styles.collapsedBrand}>
            <View style={[styles.brandIconWrap, { backgroundColor: colors.primaryTint }]}>
              <BrandingLogo
                logoDataUrl={logoDataUrl}
                size={28}
                color={colors.onPrimaryTint}
                borderRadius={surfaceRadius.button}
                variant="bot"
              />
            </View>
            <ProjectSwitcher collapsed onNavigate={closeDrawer} sidebarVariant />
          </View>
        ) : (
          <>
            <View style={styles.brandRow}>
              <View style={[styles.brandIconWrap, { backgroundColor: colors.primaryTint }]}>
                <BrandingLogo
                  logoDataUrl={logoDataUrl}
                  size={28}
                  color={colors.onPrimaryTint}
                  borderRadius={surfaceRadius.button}
                  variant="bot"
                />
              </View>
              <Text style={[typography.title, styles.brandText, { color: sidebarForeground }]} numberOfLines={1}>
                {orgName}
              </Text>
            </View>
            <ProjectSwitcher onNavigate={closeDrawer} sidebarVariant />
          </>
        )}
      </View>

      <AppScrollView
        scrollbarVariant="sidebar"
        contentContainerStyle={{
          gap: collapsed ? spacing.xs : spacing.md,
          padding: collapsed ? spacing.xs : spacing.md,
        }}>
        {collapsed
          ? navSections.flatMap((section) =>
              section.items.map((item) => (
                <Pressable
                  key={item.route}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => navigateTo(item.route)}
                  style={({ pressed, hovered }) => [
                    styles.collapsedItem,
                    {
                      borderColor: 'transparent',
                      borderLeftWidth: activeRoute === item.route ? 2 : 0,
                      borderLeftColor: colors.primary,
                      backgroundColor:
                        activeRoute === item.route
                          ? colors.primaryTint
                          : pressed || hovered
                            ? colors.primaryTint
                            : 'transparent',
                      borderRadius: surfaceRadius.button,
                    },
                  ]}>
                  <item.icon
                    size={16}
                    color={activeRoute === item.route ? colors.onPrimaryTint : sidebarMuted}
                  />
                </Pressable>
              )),
            )
          : navSections.map((section) => (
              <DrawerSection
                key={section.title}
                section={section}
                activeRoute={activeRoute}
                onNavigate={navigateTo}
              />
            ))}
        {isNative && !collapsed ? <DrawerPreferencesSection /> : null}
      </AppScrollView>

      <View style={[styles.footer, { padding: spacing.md, borderTopColor: sidebarBorder }]}>
        <Pressable
          onPress={() => {
            void (async () => {
              const confirmed = await confirm({
                title: t('userMenu.signOutConfirm.title'),
                message: t('userMenu.signOutConfirm.message'),
                cancelLabel: t('common.cancel'),
                confirmLabel: t('userMenu.signOut'),
                destructive: true,
                dimBackdrop: true,
              });
              if (!confirmed) return;
              navigation.closeDrawer();
              await onSignOut();
              router.replace('/(auth)/sign-in');
            })();
          }}
          style={({ pressed, hovered }) => [
            styles.signOut,
            {
              borderRadius: surfaceRadius.button,
              borderColor: colors.border,
              backgroundColor: pressed || hovered ? colors.primaryTint : 'transparent',
              paddingHorizontal: collapsed ? spacing.xs : spacing.sm,
              paddingVertical: spacing.xs,
              justifyContent: collapsed ? 'center' : 'flex-start',
            },
          ]}>
          <LogOut size={16} color={sidebarMuted} />
          {collapsed ? null : <Text style={[typography.body, { color: sidebarForeground }]}>{t('userMenu.signOut')}</Text>}
        </Pressable>
        {collapsed ? null : (
          <View style={[styles.footerMeta, { marginTop: spacing.xs, gap: spacing.xs }]}>
            <EditionBadge variant={productEdition} />
            <SidebarOnlineBadge />
            <View
              style={[
                styles.versionBadge,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]}>v1.0.1</Text>
            </View>
          </View>
        )}
      </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    gap: 12,
  },
  headerCollapsed: {
    alignItems: 'center',
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  brandIconWrap: {
    width: 32,
    height: 32,
    borderRadius: brandTokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandText: {
    fontSize: 18,
    flex: 1,
  },
  collapsedBrand: {
    alignItems: 'center',
    gap: 10,
  },
  collapsedItem: {
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
  },
  signOut: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionBadge: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
