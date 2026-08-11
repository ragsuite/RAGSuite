import { Image } from 'expo-image';
import { UserRound } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native';

import { brandTokens } from '@/theme/brand-tokens';

const BRAND_ICON_PNG = require('@/assets/app-brand-icon.png');
const BRAND_SYMBOL_SVG = require('@/assets/brand/ragsuite-symbol.svg');

type Props = {
  logoDataUrl: string | null;
  size: number;
  color: string;
  backgroundColor?: string;
  borderRadius?: number;
  variant?: 'bot' | 'user';
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

export function BrandingLogo({
  logoDataUrl,
  size,
  color,
  backgroundColor,
  borderRadius = brandTokens.radius.sm,
  variant = 'bot',
  style,
  imageStyle,
}: Props) {
  const iconSize = Math.round(size * 0.55);
  const FallbackIcon = UserRound;

  if (logoDataUrl) {
    return (
      <Image
        source={{ uri: logoDataUrl }}
        style={[{ width: size, height: size, borderRadius }, imageStyle]}
        contentFit="contain"
      />
    );
  }

  if (variant === 'bot') {
    const source = Platform.OS === 'web' ? BRAND_SYMBOL_SVG : BRAND_ICON_PNG;
    return (
      <Image
        source={source}
        style={[{ width: size, height: size, borderRadius }, imageStyle]}
        contentFit="contain"
      />
    );
  }

  if (backgroundColor) {
    return (
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor,
          },
          style,
        ]}>
        <FallbackIcon size={iconSize} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.tile, { width: size, height: size }, style]}>
      <FallbackIcon size={iconSize} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
