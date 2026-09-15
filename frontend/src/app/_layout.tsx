import { Slot, usePathname } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { resolveIsEmbedShell } from '@/features/auth/utils/public-embed-path';
import { AppProviders } from '@/providers/app-providers';

export default function RootLayout() {
  const pathname = usePathname();
  const windowPathname =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.pathname
      : null;
  const isEmbed = resolveIsEmbedShell({ pathname, windowPathname });

  if (isEmbed) {
    // Embed layout supplies its own minimal providers (no dashboard AppDataProviders).
    return <Slot />;
  }

  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}
