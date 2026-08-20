import { ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBrandFonts } from '@/hooks/use-brand-fonts';
import { brandTokens } from '@/theme/brand-tokens';

import { SessionProvider } from '@/features/auth/providers/session-provider';
import { useNeedsOnboarding } from '@/features/auth/hooks/use-needs-onboarding';
import { AppChatWidgetProvider } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { ChatbotConfigProvider } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { ConfigurationProvider } from '@/features/configuration/hooks/useConfiguration';
import { ActiveProjectProvider } from '@/features/projects/providers/active-project-provider';
import { SearchConfigProvider } from '@/features/search-config/hooks/useSearchConfig';
import { SettingsProvider, useSettings } from '@/features/settings/hooks/useSettings';
import { useWebThemeClass } from '@/hooks/use-web-theme-class';
import { I18nProvider } from '@/i18n';
import { I18nSettingsSync } from '@/i18n/i18n-settings-sync';
import { DrawerChromeProvider } from '@/shared/components/navigation/drawer-chrome-provider';
import { AppStatusBar } from '@/shared/components/app-status-bar';
import { AppErrorBoundary } from '@/shared/components/error/app-error-boundary';
import { ApiUnavailableOverlay } from '@/shared/components/error/api-unavailable-overlay';
import { ConfirmProvider } from '@/shared/confirm/confirm-provider';
import { ToastProvider } from '@/shared/toast/toast-provider';
import { ToastViewport } from '@/shared/toast/toast-viewport';
import { buildNavigationTheme } from '@/theme/navigation-theme';
import { loadCommunityModules } from '@/platform/modules/loadCommunityModules';

import '@/platform/ee-attach';

loadCommunityModules();

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  const fontsLoaded = useBrandFonts();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AppErrorBoundary level="critical">
            <ToastProvider>
              <SessionProvider>
                <SettingsProvider>
                  <I18nSettingsSync />
                  {/* Mount before fonts gate so session-expiry / early action toasts can render. */}
                  <ToastViewport />
                  <ApiUnavailableOverlay />
                  {!fontsLoaded ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brandTokens.color.paper }}>
                      <ActivityIndicator size="small" color={brandTokens.color.pineBright} />
                    </View>
                  ) : (
                    <AppDataProviders>
                      <NavigationThemeBridge>
                        <ConfirmProvider>
                          <AppStatusBar />
                          <DrawerChromeProvider>{children}</DrawerChromeProvider>
                        </ConfirmProvider>
                      </NavigationThemeBridge>
                    </AppDataProviders>
                  )}
                </SettingsProvider>
              </SessionProvider>
            </ToastProvider>
          </AppErrorBoundary>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function NavigationThemeBridge({ children }: Props) {
  const { effectiveTheme } = useSettings();
  useWebThemeClass(effectiveTheme);
  const navigationTheme = React.useMemo(() => buildNavigationTheme(effectiveTheme), [effectiveTheme]);
  return <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>;
}

/** Skip app modules (projects, config, chat widget) until onboarding is finished. */
function AppDataProviders({ children }: Props) {
  const needsOnboarding = useNeedsOnboarding();

  if (needsOnboarding) {
    return <>{children}</>;
  }

  return (
    <ActiveProjectProvider>
      <SearchConfigProvider>
        <ChatbotConfigProvider>
          <ConfigurationProvider>
            <AppChatWidgetProvider>{children}</AppChatWidgetProvider>
          </ConfigurationProvider>
        </ChatbotConfigProvider>
      </SearchConfigProvider>
    </ActiveProjectProvider>
  );
}
