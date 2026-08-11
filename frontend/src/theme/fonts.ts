import { Platform } from 'react-native';

/** PostScript names from @expo-google-fonts/* — used after `useBrandFonts` loads. */
export const brandFontFamily = {
  display: 'Fraunces_500Medium',
  displayRegular: 'Fraunces_400Regular',
  sans: 'HankenGrotesk_400Regular',
  sansMedium: 'HankenGrotesk_500Medium',
  sansSemiBold: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

const webFallback = {
  display: '"Fraunces", Georgia, "Times New Roman", serif',
  displayRegular: '"Fraunces", Georgia, "Times New Roman", serif',
  sans: '"Hanken Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  sansMedium: '"Hanken Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  sansSemiBold: '"Hanken Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  sansBold: '"Hanken Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  monoMedium: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
} as const;

const nativeFallback = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) ?? 'serif',
  displayRegular: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) ?? 'serif',
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' }) ?? 'sans-serif',
  sansMedium: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'sans-serif' }) ?? 'sans-serif',
  sansSemiBold: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'sans-serif' }) ?? 'sans-serif',
  sansBold: Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' }) ?? 'sans-serif',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace',
  monoMedium: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace',
} as const;

export function resolveBrandFonts(loaded: boolean) {
  if (Platform.OS === 'web') {
    return webFallback;
  }
  return loaded ? brandFontFamily : nativeFallback;
}
