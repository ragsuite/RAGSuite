import { Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
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

/**
 * Minimal shell for public embed routes — no dashboard chrome / AppDataProviders.
 */
export default function EmbedLayout() {
  useEffect(() => ensureEmbedBrandFonts(), []);

  return (
    <GestureHandlerRootView style={styles.root}>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
