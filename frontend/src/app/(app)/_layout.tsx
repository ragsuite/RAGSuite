import { Drawer } from "expo-router/drawer";
import { Redirect, Slot, usePathname } from "expo-router";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useNeedsOnboarding } from "@/features/auth/hooks/use-needs-onboarding";
import { SplashScreen } from "@/features/auth/screens/splash-screen";
import { useSession } from "@/features/auth/providers/session-provider";
import { AppChatWidgetHost } from "@/features/app-chat-widget/components/AppChatWidgetHost";
import { NotificationScreen } from "@/modules/notifications";
import { NotificationAlertsProvider } from "@/features/notifications/providers/notification-alerts-provider";
import { OrgAdminAccessProvider } from "@/features/organization/providers/org-admin-access-provider";
import { AppChromeHeader } from "@/shared/components/navigation/app-chrome-header";
import { AppDrawer } from "@/shared/components/navigation/app-drawer";
import { AppErrorBoundary } from "@/shared/components/error/app-error-boundary";
import { ComponentErrorBoundary } from "@/shared/components/error/component-error-boundary";
import {
  AppShellProvider,
  useAppShell,
} from "@/shared/components/navigation/app-shell-provider";
import { SidePanelOverlay } from "@/shared/components/adaptive/side-panel-overlay";
import { AppShellOverlays } from "@/shared/components/shell/app-shell-overlays";
import { WEB_APP_FOOTER_HEIGHT } from "@/shared/constants/web-shell-layout";
import {
  WEB_DRAWER_WIDTH_COLLAPSED,
  WEB_DRAWER_WIDTH_EXPANDED,
} from "@/shared/constants/layout";
import { overlayTokens } from "@/shared/constants/overlay-tokens";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { motion } from "@/theme/motion";
import { useTranslation } from "@/i18n";

const WEB_FOOTER_RAGSUITE_URL = "https://www.ragsuite.de/";

const WEB_FOOTER_LINKS = [
  { label: "Impressum", url: "https://ragsuite.de/impressum/" },
  { label: "Datenschutzerklärung", url: "https://ragsuite.de/datenschutz/" },
  { label: "Terms", url: "https://ragsuite.de/terms/" },
  { label: "AVV", url: "https://ragsuite.de/avv/" },
  { label: "Security", url: "https://ragsuite.de/security/disclosure/" },
] as const;

export default function AppLayout() {
  const { isBooting, isAuthenticated } = useSession();
  const needsOnboarding = useNeedsOnboarding();

  if (isBooting) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (needsOnboarding) {
    return <OnboardingLayout />;
  }

  return (
    <AppShellProvider>
      <OrgAdminAccessProvider>
        <NotificationAlertsProvider>
          <AppErrorBoundary level="page">
            <AppLayoutContent />
          </AppErrorBoundary>
        </NotificationAlertsProvider>
      </OrgAdminAccessProvider>
    </AppShellProvider>
  );
}

/** Keeps the browser URL on `/onboarding` while onboarding is required. */
function OnboardingLayout() {
  const pathname = usePathname();
  const onOnboardingRoute =
    pathname === "/onboarding" || pathname.endsWith("/onboarding");

  if (!onOnboardingRoute) {
    return <Redirect href="/(app)/onboarding" />;
  }

  return (
    <View style={styles.onboardingRoot}>
      <Slot />
    </View>
  );
}

function AppLayoutContent() {
  const { signOut } = useSession();
  const {
    isSidebarCollapsed,
    isNotificationsPanelOpen,
    closeNotificationsPanel,
  } = useAppShell();
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const drawerBackground = colors.sidebar;

  return (
    <View style={styles.root}>
      <Drawer
        drawerContent={(props) => (
          <AppDrawer
            {...props}
            onSignOut={() => void signOut()}
            collapsed={Platform.OS === "web" ? isSidebarCollapsed : false}
          />
        )}
        screenOptions={({ route }) => ({
          drawerType: Platform.OS === "web" ? "permanent" : "front",
          sceneContainerStyle:
            Platform.OS === "web"
              ? { paddingBottom: WEB_APP_FOOTER_HEIGHT }
              : undefined,
          drawerStyle:
            Platform.OS === "web"
              ? {
                  width: isSidebarCollapsed ? WEB_DRAWER_WIDTH_COLLAPSED : WEB_DRAWER_WIDTH_EXPANDED,
                  backgroundColor: drawerBackground,
                  transition: `width ${motion.sidebar}ms ease-in-out`,
                }
              : {
                  backgroundColor: drawerBackground,
                  width: "86%",
                  maxWidth: 340,
                  height: "100%",
                },
          drawerHideStatusBarOnOpen: false,
          overlayColor: Platform.OS === "web" ? "transparent" : undefined,
          swipeEnabled: Platform.OS !== "web",
          headerShown: route.name !== "(tabs)",
          header: () => <AppChromeHeader showMenuButton />,
        })}
      >
        <Drawer.Screen name="(tabs)" options={{ title: "Home" }} />
        <Drawer.Screen name="projects" options={{ title: "Projects" }} />
        <Drawer.Screen name="documents" options={{ title: "Documents" }} />
        <Drawer.Screen name="analytics" options={{ title: "Analytics" }} />
        <Drawer.Screen
          name="system-health"
          options={{ title: "System Health" }}
        />
        <Drawer.Screen
          name="compare-models"
          options={{ title: "Compare Models" }}
        />
        <Drawer.Screen name="history" options={{ title: "Chat History" }} />
        <Drawer.Screen
          name="configuration"
          options={{ title: "Configuration" }}
        />
        <Drawer.Screen
          name="feedback-moderation"
          options={{ title: "Feedback" }}
        />
        <Drawer.Screen name="audit-logs" options={{ title: "Audit Logs" }} />
        <Drawer.Screen
          name="organization"
          options={{ title: "Organization" }}
        />
        <Drawer.Screen
          name="organization-settings"
          options={{ title: "Organization Settings" }}
        />
        <Drawer.Screen
          name="organization-users"
          options={{ title: "Organization Users" }}
        />
        <Drawer.Screen
          name="organization-projects"
          options={{ title: "Organization Projects" }}
        />
        <Drawer.Screen
          name="organization-sso"
          options={{ title: "Organization SSO" }}
        />
        <Drawer.Screen
          name="notifications"
          options={{ title: "Notifications" }}
        />
        <Drawer.Screen name="profile" options={{ title: "Profile" }} />
        <Drawer.Screen
          name="sign-out"
          options={{ title: "Sign out", headerShown: false }}
        />
      </Drawer>

      {Platform.OS === "web" ? (
        <SidePanelOverlay
          visible={isNotificationsPanelOpen}
          onClose={closeNotificationsPanel}
          width={overlayTokens.width.sideSheetNotify}
          accessibilityLabel={t("notifications.title")}
        >
          <ComponentErrorBoundary componentName="NotificationsInbox">
            <NotificationScreen
              mode="sheet"
              onRequestClose={closeNotificationsPanel}
            />
          </ComponentErrorBoundary>
        </SidePanelOverlay>
      ) : null}

      <ComponentErrorBoundary componentName="AppChatWidget">
        <AppChatWidgetHost />
      </ComponentErrorBoundary>
      <AppShellOverlays />
      {Platform.OS === "web" ? (
        <LinearGradient
          colors={[colors.background, colors.background, colors.surfaceMuted]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            styles.webFooter,
            {
              left: isSidebarCollapsed ? WEB_DRAWER_WIDTH_COLLAPSED : WEB_DRAWER_WIDTH_EXPANDED,
              height: WEB_APP_FOOTER_HEIGHT,
              borderTopColor: colors.border,
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
          <View style={styles.webFooterCopyRow}>
            <Text
              style={[
                typography.caption,
                styles.webFooterCopy,
                { color: colors.textMuted },
              ]}
            >
              © 2026 NITSAN ·{" "}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="RAGSuite"
              onPress={() => {
                void Linking.openURL(WEB_FOOTER_RAGSUITE_URL);
              }}
              style={({ pressed, hovered, focused }) => [
                styles.webFooterLinkPressable,
                {
                  opacity: pressed ? 0.75 : 1,
                  borderBottomColor:
                    hovered || focused ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  styles.webFooterLink,
                  { color: colors.primary },
                ]}
              >
                RAGSuite
              </Text>
            </Pressable>
          </View>
          <View style={styles.webFooterLinks}>
            {WEB_FOOTER_LINKS.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(item.url);
                }}
                style={({ pressed, hovered, focused }) => [
                  styles.webFooterLinkPressable,
                  {
                    opacity: pressed ? 0.75 : 1,
                    borderBottomColor:
                      hovered || focused ? colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    styles.webFooterLink,
                    { color: colors.textMuted },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  onboardingRoot: { flex: 1 },
  root: { flex: 1 },
  webFooter: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    /** Below side-panel overlays (100000+) so backdrop covers the footer. */
    zIndex: 10,
    paddingVertical: 0,
  },
  webFooterCopy: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  webFooterCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  webFooterLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  webFooterLinkPressable: {
    minHeight: 22,
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  webFooterLink: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
});
