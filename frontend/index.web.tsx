import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

function isEmbedBootstrapPath(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  return pathname === '/embed/chatbot' || pathname.startsWith('/embed/');
}

/**
 * Static nginx export: CanvasKit must always resolve wasm from the site root.
 * Relative locateFile breaks on deep routes (e.g. /onboarding → workspace analytics)
 * and leaves global.CanvasKit unset → white screen (XYWHRect undefined).
 *
 * Embed iframes (/embed/chatbot, /embed/search) never use Skia charts — skip the
 * ~7.6MB wasm gate so paint-ready `resize` can fire sooner.
 */
function mountApp() {
  renderRootComponent(App);
}

if (isEmbedBootstrapPath()) {
  mountApp();
} else {
  LoadSkiaWeb({
    locateFile: (file) => `/${file}`,
  })
    .then(() => {
      mountApp();
    })
    .catch((error) => {
      console.error('Failed to initialize React Native Skia for web', error);
      // Still mount the app so non-chart screens work; analytics charts need Skia.
      mountApp();
    });
}
