import { Slot, usePathname } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/features/auth/providers/session-provider';
import { SettingsProvider } from '@/features/settings/hooks/useSettings';
import { I18nProvider } from '@/i18n';

import '@/platform/ee-attach';

const BRAND_FONTS_LINK_ID = 'ragsuite-embed-brand-fonts';

function ensureEmbedBrandFonts(): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return () => undefined;
  }
  let link = document.getElementById(BRAND_FONTS_LINK_ID) as HTMLLinkElement | null;
  let created = false;
  if (!link) {
    link = document.createElement('link');
    link.id = BRAND_FONTS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = '/fonts/ragsuite-brand.css';
    document.head.appendChild(link);
    created = true;
  }
  return () => {
    if (created && link && link.parentNode) {
      link.parentNode.removeChild(link);
    }
  };
}

function isSearchEmbedPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '');
  return path.includes('/embed/search') || path.endsWith('/search');
}

/**
 * Minimal shell for public embed routes — no dashboard chrome / AppDataProviders.
 */
export default function EmbedLayout() {
  useEffect(() => ensureEmbedBrandFonts(), []);
  const pathname = usePathname();
  const searchEmbed = isSearchEmbedPath(pathname);
  const rootStyle = useMemo(
    () => (searchEmbed ? styles.searchRoot : styles.chatRoot),
    [searchEmbed],
  );

  return (
    <GestureHandlerRootView style={rootStyle}>
      <SafeAreaProvider>
        <I18nProvider>
          <SessionProvider>
            <SettingsProvider>
              <Slot />
            </SettingsProvider>
          </SessionProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const chatRoot: ViewStyle = {
  flex: 1,
  backgroundColor: 'transparent',
};

const searchRoot: ViewStyle = {
  width: '100%',
  alignSelf: 'flex-start',
  backgroundColor: 'transparent',
  ...(Platform.OS === 'web' ? ({ height: 'auto' } as object) : null),
};

const styles = StyleSheet.create({
  chatRoot,
  searchRoot,
});
