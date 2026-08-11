import { DrawerActions } from '@react-navigation/native';
import { useNavigation, useRouter, useSegments } from 'expo-router';
import { Bell, ChevronLeft, PanelLeft, Search } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandTokens } from '@/theme/brand-tokens';

import { UserProfileMenu } from '@/shared/components/navigation/user-profile-menu';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { AppThemeToggle } from '@/shared/components/app-theme-toggle';
import { LanguageSelector } from '@/shared/components/language-selector';

import {
  activeRouteFromSegments,
  AUDIT_LOGS_LIST_HREF,
  CHAT_HISTORY_LIST_HREF,
  FEEDBACK_MODERATION_LIST_HREF,
  SEARCH_HISTORY_LIST_HREF,
  getAnalyticsHeaderMeta,
  getAuditLogsHeaderMeta,
  getChatHistoryHeaderMeta,
  getCompareModelsHeaderMeta,
  getConfigurationHeaderMeta,
  getProjectsHeaderMeta,
  getOrganizationHeaderMeta,
  getFeedbackModerationHeaderMeta,
  getChatbotConfigHeaderMeta,
  getSearchConfigHeaderMeta,
  getSettingsHeaderMeta,
  isAuditLogsDetailRoute,
  isChatHistoryDetailRoute,
  isFeedbackModerationDetailRoute,
  isSearchHistoryDetailRoute,
  titleKeyForAppRoute,
} from '@/config/navigation';
import { resolveHeaderMeta } from '@/i18n/resolve-header-meta';
import { useTranslation } from '@/i18n';
import { useNotificationAlerts } from '@/features/notifications/providers/notification-alerts-provider';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import { motion } from '@/theme/motion';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  variant?: 'auto' | 'mobile' | 'web';
  title?: string;
  /** Optional second line under title (e.g. context); settings inner routes set this from route meta when omitted. */
  subtitle?: string;
  showMenuButton?: boolean;
  rightSlot?: React.ReactNode;
};

export function AppChromeHeader({
  variant = 'auto',
  title,
  subtitle: subtitleProp,
  showMenuButton = true,
  rightSlot,
}: Props = {}) {
  const navigation = useNavigation();
  const router = useRouter();
  const segments = useSegments();
  const { mode, colors, spacing, typography, elevation, surfaceRadius } = useAppTheme();
  const insets = useSafeAreaInsets();
  const appShell = useAppShell();
  const { unreadCount } = useNotificationAlerts();
  const { t } = useTranslation();

  const routeSegments = segments as string[];
  const active = activeRouteFromSegments(routeSegments);
  const settingsHeaderMeta = resolveHeaderMeta(t, getSettingsHeaderMeta(routeSegments));
  const searchConfigHeaderMeta = resolveHeaderMeta(t, getSearchConfigHeaderMeta(routeSegments));
  const chatbotConfigHeaderMeta = resolveHeaderMeta(t, getChatbotConfigHeaderMeta(routeSegments));
  const analyticsHeaderMeta = resolveHeaderMeta(t, getAnalyticsHeaderMeta(active));
  const auditLogsHeaderMeta = resolveHeaderMeta(t, getAuditLogsHeaderMeta(routeSegments));
  const chatHistoryHeaderMeta = resolveHeaderMeta(t, getChatHistoryHeaderMeta(routeSegments));
  const feedbackHeaderMeta = resolveHeaderMeta(t, getFeedbackModerationHeaderMeta(routeSegments));
  const compareModelsHeaderMeta = resolveHeaderMeta(t, getCompareModelsHeaderMeta(routeSegments));
  const projectsHeaderMeta = resolveHeaderMeta(t, getProjectsHeaderMeta(routeSegments));
  const configurationHeaderMeta = resolveHeaderMeta(t, getConfigurationHeaderMeta(routeSegments));
  const organizationHeaderMeta = resolveHeaderMeta(t, getOrganizationHeaderMeta(routeSegments));
  const resolvedTitle =
    title ??
    analyticsHeaderMeta?.title ??
    chatbotConfigHeaderMeta?.title ??
    searchConfigHeaderMeta?.title ??
    compareModelsHeaderMeta?.title ??
    projectsHeaderMeta?.title ??
    configurationHeaderMeta?.title ??
    organizationHeaderMeta?.title ??
    chatHistoryHeaderMeta?.title ??
    feedbackHeaderMeta?.title ??
    auditLogsHeaderMeta?.title ??
    settingsHeaderMeta?.title ??
    t(titleKeyForAppRoute(active));
  const resolvedSubtitle =
    subtitleProp ??
    analyticsHeaderMeta?.subtitle ??
    chatbotConfigHeaderMeta?.subtitle ??
    searchConfigHeaderMeta?.subtitle ??
    compareModelsHeaderMeta?.subtitle ??
    projectsHeaderMeta?.subtitle ??
    configurationHeaderMeta?.subtitle ??
    organizationHeaderMeta?.subtitle ??
    chatHistoryHeaderMeta?.subtitle ??
    feedbackHeaderMeta?.subtitle ??
    auditLogsHeaderMeta?.subtitle ??
    settingsHeaderMeta?.subtitle;
  const resolvedVariant = variant === 'auto' ? (Platform.OS === 'web' ? 'web' : 'mobile') : variant;
  const showNotificationAction = active !== 'notifications';
  const showNotificationFilterAction = active === 'notifications' && resolvedVariant === 'mobile';
  const canGoBack = navigation.canGoBack();
  const isTabRoute = routeSegments.includes('(tabs)');
  const isSettingsInnerRoute = routeSegments.includes('settings') && !isTabRoute;
  const isSearchConfigInnerRoute = routeSegments.includes('search-config') && !isTabRoute;
  const isChatbotConfigInnerRoute = routeSegments.includes('chatbot-config') && !isTabRoute;
  const isAuditLogsDetailScreen = isAuditLogsDetailRoute(routeSegments);
  const isChatHistoryDetailScreen = isChatHistoryDetailRoute(routeSegments);
  const isSearchHistoryDetailScreen = isSearchHistoryDetailRoute(routeSegments);
  const isFeedbackDetailScreen = isFeedbackModerationDetailRoute(routeSegments);
  const isInnerModuleRoute = isSettingsInnerRoute || isSearchConfigInnerRoute || isChatbotConfigInnerRoute;
  const shouldShowBackButton =
    resolvedVariant === 'mobile' &&
    (isInnerModuleRoute ||
      isAuditLogsDetailScreen ||
      isChatHistoryDetailScreen ||
      isSearchHistoryDetailScreen ||
      isFeedbackDetailScreen ||
      (canGoBack && !isTabRoute));
  const usesModuleTabFallback = shouldShowBackButton && isInnerModuleRoute && !canGoBack;
  const backAccessibilityLabel = isChatHistoryDetailScreen
    ? t('common.a11y.backToChatHistory')
    : isSearchHistoryDetailScreen
      ? t('common.a11y.backToSearchHistory')
    : isFeedbackDetailScreen
      ? t('common.a11y.backToFeedback')
      : isAuditLogsDetailScreen
      ? t('common.a11y.backToAuditLogs')
      : usesModuleTabFallback
      ? isChatbotConfigInnerRoute
        ? t('common.a11y.backToChatbotConfig')
        : isSearchConfigInnerRoute
          ? t('common.a11y.backToSearchConfig')
          : t('common.a11y.backToSettings')
      : t('common.a11y.goBack');
  const backAccessibilityHint = isChatHistoryDetailScreen
    ? t('common.a11y.hint.backToChatHistory')
    : isSearchHistoryDetailScreen
      ? t('common.a11y.hint.backToSearchHistory')
    : isFeedbackDetailScreen
      ? t('common.a11y.hint.backToFeedback')
      : isAuditLogsDetailScreen
      ? t('common.a11y.hint.backToAuditLogs')
      : usesModuleTabFallback
      ? isChatbotConfigInnerRoute
        ? t('common.a11y.hint.backToChatbotConfig')
        : isSearchConfigInnerRoute
          ? t('common.a11y.hint.backToSearchConfig')
          : t('common.a11y.hint.backToSettings')
      : t('common.a11y.hint.goBack');

  const openDrawer = useCallback(() => {
    if (Platform.OS === 'web') {
      appShell.toggleSidebar();
      return;
    }
    navigation.dispatch(DrawerActions.openDrawer());
  }, [appShell, navigation]);

  const openNotifications = useCallback(() => {
    if (Platform.OS === 'web') {
      appShell.openNotificationsPanel();
      return;
    }
    router.push('/(app)/notifications');
  }, [appShell, router]);

  const openCommandPalette = useCallback(() => {
    appShell.openCommandPalette();
  }, [appShell]);

  const openHelp = useCallback(() => {
    appShell.openHelp();
  }, [appShell]);

  const isWeb = resolvedVariant === 'web';
  const isAuditLogsMobile = !isWeb && routeSegments.includes('audit-logs');
  const isChatHistoryMobile = !isWeb && routeSegments.includes('history');
  const isFeedbackMobile = !isWeb && routeSegments.includes('feedback-moderation');
  const showHeaderSubtitle =
    Boolean(resolvedSubtitle) && !isAuditLogsMobile && !isChatHistoryMobile && !isFeedbackMobile;
  const isDark = mode === 'dark';
  const headerBackground = isWeb ? colors.surface : colors.background;
  const textColor = colors.text;
  const surfaceColor = isWeb ? colors.surfaceMuted : hexToRgba(colors.primary, 0.08);
  const menuSurfaceColor = isWeb ? hexToRgba(colors.primary, isDark ? 0.2 : 0.12) : hexToRgba(colors.primary, 0.12);
  const menuSurfacePressed = isWeb ? hexToRgba(colors.primary, isDark ? 0.3 : 0.2) : hexToRgba(colors.primary, 0.2);
  const actionSurfaceColor = isWeb ? hexToRgba(colors.primary, isDark ? 0.12 : 0.07) : surfaceColor;
  const actionSurfacePressed = isWeb ? hexToRgba(colors.primary, isDark ? 0.2 : 0.14) : hexToRgba(colors.primary, 0.14);
  const borderColor = colors.border;
  const chromeIconColor = isDark ? colors.textSoft : colors.primary;
  const controlSize = isWeb ? APP_CHROME_CONTROL_HEIGHT : 34;
  const controlRadius = surfaceRadius.button;

  const headerBody = (
    <>
      <View style={styles.leftSection}>
        {shouldShowBackButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            accessibilityHint={backAccessibilityHint}
            hitSlop={12}
            onPress={() => {
              if (isChatHistoryDetailScreen) {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(CHAT_HISTORY_LIST_HREF);
                }
                return;
              }
              if (isSearchHistoryDetailScreen) {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(SEARCH_HISTORY_LIST_HREF);
                }
                return;
              }
              if (isFeedbackDetailScreen) {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(FEEDBACK_MODERATION_LIST_HREF);
                }
                return;
              }
              if (isAuditLogsDetailScreen) {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(AUDIT_LOGS_LIST_HREF);
                }
                return;
              }
              if (canGoBack) {
                navigation.goBack();
                return;
              }
              if (isChatbotConfigInnerRoute) {
                router.push('/(app)/(tabs)/chatbot-config');
                return;
              }
              if (isSearchConfigInnerRoute) {
                router.push('/(app)/(tabs)/search-config');
                return;
              }
              router.push('/(app)/(tabs)/settings');
            }}
            style={({ pressed, focused, hovered }) => [
              styles.menuBtn,
              {
                width: controlSize,
                height: controlSize,
                borderRadius: controlRadius,
              },
              {
                opacity: pressed ? 0.92 : 1,
                borderColor: hexToRgba(colors.primary, isDark ? 0.48 : 0.2),
                backgroundColor: pressed || hovered ? menuSurfacePressed : menuSurfaceColor,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
              focusRingStyle(focused, colors.primary),
            ]}>
            <ChevronLeft size={isWeb ? 18 : 18} strokeWidth={2.4} color={chromeIconColor} />
          </Pressable>
        ) : showMenuButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.a11y.openMenu')}
            hitSlop={12}
            onPress={openDrawer}
            style={({ pressed, focused, hovered }) => [
              styles.menuBtn,
              {
                width: controlSize,
                height: controlSize,
                borderRadius: controlRadius,
              },
              {
                opacity: pressed ? 0.92 : 1,
                borderColor: hexToRgba(colors.primary, isDark ? 0.48 : 0.2),
                backgroundColor: pressed || hovered ? menuSurfacePressed : menuSurfaceColor,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
              focusRingStyle(focused, colors.primary),
            ]}>
            <PanelLeft size={isWeb ? 18 : 17} strokeWidth={2.2} color={chromeIconColor} />
          </Pressable>
        ) : null}
        {!shouldShowBackButton && isWeb ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.search')}
            hitSlop={12}
            onPress={openCommandPalette}
            style={({ pressed, focused, hovered }) => [
              styles.searchBtn,
              styles.searchBtnWeb,
              {
                height: controlSize,
                borderRadius: controlRadius,
                paddingHorizontal: spacing.sm,
              },
              {
                opacity: pressed ? 0.92 : 1,
                borderColor: hexToRgba(colors.primary, isDark ? 0.34 : 0.16),
                backgroundColor: pressed || hovered ? actionSurfacePressed : actionSurfaceColor,
                transform: [{ scale: pressed ? motion.pressScale : 1 }],
              },
              focusRingStyle(focused, colors.primary),
            ]}>
            <Search size={16} strokeWidth={2.2} color={chromeIconColor} />
            <Text style={[typography.caption, { color: colors.textMuted, marginLeft: spacing.xxs }]}>
              {t('common.search')}
            </Text>
          </Pressable>
        ) : null}
        {!isWeb ? (
          <View style={styles.titleColumn}>
            <View style={styles.titleRow}>
              <Text style={[typography.subtitle, styles.title, { color: textColor, flex: 1 }]} numberOfLines={1}>
                {resolvedTitle}
              </Text>
            </View>
            {showHeaderSubtitle ? (
              <Text
                style={[typography.caption, styles.subtitle, { color: colors.textMuted, lineHeight: 18 }]}
                numberOfLines={isInnerModuleRoute ? 2 : 1}>
                {resolvedSubtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.rightSection}>
        {rightSlot ?? (
          <View style={styles.actionRow}>
            {isWeb ? (
              <>
                <LanguageSelector size={controlSize} borderRadius={controlRadius} />
                <AppThemeToggle size={controlSize} borderRadius={controlRadius} />
              </>
            ) : null}
            {isWeb ? (
              <Pressable
                onPress={openHelp}
                accessibilityRole="button"
                accessibilityLabel={t('help.title')}
                style={({ pressed, focused, hovered }) => [
                  styles.iconAction,
                  {
                    width: controlSize,
                    height: controlSize,
                    borderRadius: controlRadius,
                  },
                  {
                    borderColor: hexToRgba(colors.primary, isDark ? 0.34 : 0.16),
                    backgroundColor: pressed || hovered ? actionSurfacePressed : actionSurfaceColor,
                    transform: [{ scale: pressed ? motion.pressScale : 1 }],
                  },
                  focusRingStyle(focused, colors.primary),
                ]}>
                <ActionIcons.help size={16} strokeWidth={2.2} color={chromeIconColor} />
              </Pressable>
            ) : (
              <Pressable
                onPress={openCommandPalette}
                accessibilityRole="button"
                accessibilityLabel={t('common.search')}
                style={({ pressed, focused, hovered }) => [
                  styles.iconAction,
                  {
                    width: controlSize,
                    height: controlSize,
                    borderRadius: controlRadius,
                  },
                  {
                    borderColor: hexToRgba(colors.primary, isDark ? 0.34 : 0.16),
                    backgroundColor: pressed || hovered ? actionSurfacePressed : actionSurfaceColor,
                    transform: [{ scale: pressed ? motion.pressScale : 1 }],
                  },
                  focusRingStyle(focused, colors.primary),
                ]}>
                <Search size={16} strokeWidth={2.2} color={chromeIconColor} />
              </Pressable>
            )}
            {showNotificationAction ? (
              <Pressable
                onPress={openNotifications}
                accessibilityRole="button"
                accessibilityLabel={
                  unreadCount > 0
                    ? `${t('notifications.title')} (${unreadCount > 99 ? '99+' : unreadCount})`
                    : t('notifications.title')
                }
                style={({ pressed, focused, hovered }) => [
                  styles.iconAction,
                  {
                    width: controlSize,
                    height: controlSize,
                    borderRadius: controlRadius,
                  },
                  {
                    borderColor: hexToRgba(colors.primary, isDark ? 0.34 : 0.16),
                    backgroundColor: pressed || hovered ? actionSurfacePressed : actionSurfaceColor,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                  focusRingStyle(focused, colors.primary),
                ]}>
                <Bell size={16} strokeWidth={2.2} color={chromeIconColor} />
                {unreadCount > 0 ? (
                  <View
                    style={[
                      styles.unreadBadge,
                      unreadCount > 99 ? styles.unreadBadgeWide : null,
                      { backgroundColor: colors.danger },
                    ]}>
                    <Text style={[styles.unreadBadgeText, { color: colors.textOnPrimary }]}>
                      {unreadCount > 99 ? '99+' : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
            {showNotificationFilterAction ? (
              <Pressable
                onPress={appShell.toggleNotificationsFilters}
                style={({ pressed, focused, hovered }) => [
                  styles.iconAction,
                  {
                    width: controlSize,
                    height: controlSize,
                    borderRadius: controlRadius,
                  },
                  {
                    borderColor: hexToRgba(colors.primary, isDark ? 0.34 : 0.16),
                    backgroundColor: pressed || hovered ? actionSurfacePressed : actionSurfaceColor,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                  focusRingStyle(focused, colors.primary),
                ]}>
                <ActionIcons.filter size={16} strokeWidth={2.2} color={chromeIconColor} />
              </Pressable>
            ) : null}
            <UserProfileMenu controlSize={controlSize} />
          </View>
        )}
      </View>
    </>
  );

  if (isWeb) {
    return (
      <View
        style={[
          styles.bar,
          elevation.card,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            minHeight: 56,
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm,
            paddingHorizontal: spacing.md,
          },
        ]}>
        {headerBody}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: headerBackground,
          borderBottomColor: borderColor,
          paddingTop: spacing.sm + insets.top,
          paddingBottom: spacing.sm,
          paddingHorizontal: spacing.md,
        },
      ]}>
      {headerBody}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  if (parsed.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBtn: {
    width: APP_CHROME_CONTROL_HEIGHT,
    height: APP_CHROME_CONTROL_HEIGHT,
    borderRadius: brandTokens.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  searchBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  searchBtnWeb: {
    minWidth: 120,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  title: {
  },
  subtitle: {
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconAction: {
    width: APP_CHROME_CONTROL_HEIGHT,
    height: APP_CHROME_CONTROL_HEIGHT,
    borderRadius: brandTokens.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeWide: {
    minWidth: 24,
    height: 20,
    top: -3,
    right: -3,
  },
  unreadBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});
