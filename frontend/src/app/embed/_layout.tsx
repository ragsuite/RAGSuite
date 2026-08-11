import { Slot } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/features/auth/providers/session-provider';
import { SettingsProvider } from '@/features/settings/hooks/useSettings';
import { I18nProvider } from '@/i18n';

/**
 * Minimal shell for public embed routes — no dashboard chrome / AppDataProviders.
 */
export default function EmbedLayout() {
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
