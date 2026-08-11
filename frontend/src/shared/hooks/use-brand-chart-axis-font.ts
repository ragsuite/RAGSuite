import { useFont } from '@shopify/react-native-skia';

const HANKEN_REGULAR = require('@expo-google-fonts/hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf');

/** Skia chart axis labels — Hanken Grotesk to match ragsuite.de UI typography. */
export function useBrandChartAxisFont(size: number) {
  return useFont(HANKEN_REGULAR, size);
}
