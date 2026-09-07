import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { overlayTokens } from '@/shared/constants/overlay-tokens';

type Props = {
  style?: StyleProp<ViewStyle>;
};

const WEB_BLUR_STYLE =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      } as object)
    : null;

/** Shared dim + blur layer for confirm / dialog overlays. */
export function OverlayBlurBackdrop({ style }: Props) {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[styles.fill, styles.dim, WEB_BLUR_STYLE, style]}
      />
    );
  }

  return (
    <View pointerEvents="none" style={[styles.fill, style]}>
      <BlurView intensity={45} tint="dark" style={styles.fill} />
      <View style={[styles.fill, styles.dim]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    backgroundColor: overlayTokens.backdrop,
  },
});
