import { Slot, usePathname } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { AppProviders } from '@/providers/app-providers';

function isEmbedPath(pathname: string): boolean {
  return pathname === '/embed/chatbot' || pathname.startsWith('/embed/');
}

function isEmbedBootstrapPath(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return isEmbedPath(window.location.pathname);
}

export default function RootLayout() {
  const pathname = usePathname();
  const isEmbed = isEmbedPath(pathname) || isEmbedBootstrapPath();

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
