import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/**
 * Static nginx export: CanvasKit must always resolve wasm from the site root.
 * Relative locateFile breaks on deep routes (e.g. /onboarding → workspace analytics)
 * and leaves global.CanvasKit unset → white screen (XYWHRect undefined).
 */
LoadSkiaWeb({
  locateFile: (file) => `/${file}`,
})
  .then(() => {
    renderRootComponent(App);
  })
  .catch((error) => {
    console.error('Failed to initialize React Native Skia for web', error);
    // Still mount the app so non-chart screens work; analytics charts need Skia.
    renderRootComponent(App);
  });
