import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { overlayTokens } from '@/shared/constants/overlay-tokens';

type Props = {
  onPress: () => void;
  disableBlur?: boolean;
};

const WEB_BACKDROP_STYLE = Platform.OS === 'web'
  ? ({
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    } as object)
  : null;

export function AppChatWidgetBackdrop({ onPress, disableBlur = false }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('chatbot.widget.app.closeChat.a11y')}
      onPress={onPress}
      style={styles.pressable}>
      {Platform.OS === 'web' ? (
        <View style={[styles.fill, styles.dim, disableBlur ? null : WEB_BACKDROP_STYLE]} />
      ) : (
        <>
          <BlurView intensity={45} tint="dark" style={styles.fill} />
          <View style={[styles.fill, styles.dim]} />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    backgroundColor: overlayTokens.backdrop,
  },
});
