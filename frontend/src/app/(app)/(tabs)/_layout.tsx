import { Tabs } from 'expo-router';
import { Bot, Gauge, Home, Search, Settings } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';
import { AppBottomTabBar } from '@/shared/components/navigation/app-bottom-tab-bar';
import { AppChromeHeader } from '@/shared/components/navigation/app-chrome-header';
import { WEB_APP_FOOTER_HEIGHT } from '@/shared/constants/web-shell-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export default function AppTabsLayout() {
  const { colors } = useAppTheme();
  const { canAccessRoute } = useActiveProject();

  const tabHref = (route: string) => (canAccessRoute(route) ? undefined : null);

  return (
    <RouteErrorBoundary pageName="Tabs">
      <Tabs
        tabBar={(props) => (Platform.OS === 'web' ? null : <AppBottomTabBar {...props} />)}
        // Bottom tabs web options omit sceneContainerStyle in current RN types.
        screenOptions={{
          headerShown: true,
          header: () => <AppChromeHeader showMenuButton />,
          ...(Platform.OS === 'web'
            ? ({
                sceneContainerStyle: { paddingBottom: WEB_APP_FOOTER_HEIGHT },
              } as object)
            : {}),
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle:
            Platform.OS === 'web'
              ? { display: 'none', height: 0, overflow: 'hidden', boxShadow: 'none' }
              : {
                  position: 'absolute',
                  backgroundColor: 'transparent',
                  borderTopWidth: 0,
                  elevation: 0,
                  shadowOpacity: 0,
                  height: 0,
                },
          tabBarLabelStyle: { fontSize: 11 },
          tabBarHideOnKeyboard: true,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarLabel: 'Home',
            href: tabHref('index'),
            tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="crawl-management"
          options={{
            title: 'Crawl',
            tabBarLabel: 'Crawl',
            href: tabHref('crawl-management'),
            tabBarIcon: ({ color, size }) => <Gauge color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="chatbot-config"
          options={{
            title: 'Chat',
            tabBarLabel: 'Chat',
            href: tabHref('chatbot-config'),
            tabBarIcon: ({ color, size }) => <Bot color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="search-config"
          options={{
            title: 'Search',
            tabBarLabel: 'Search',
            href: tabHref('search-config'),
            tabBarIcon: ({ color, size }) => <Search color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            href: tabHref('settings'),
            tabBarIcon: ({ color, size }) => <Settings color={color} size={size ?? 22} />,
          }}
        />
      </Tabs>
    </RouteErrorBoundary>
  );
}
