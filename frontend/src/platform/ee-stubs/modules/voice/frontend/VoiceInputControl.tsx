import { Mic } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { VoiceInputSlotProps } from '@/platform/extension-slots';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';

/**
 * CE decorative mic — overwritten when EE `registerVoiceUi()` runs.
 * Keeps Live Preview / admin chrome aligned with speech-input toggles.
 */
export function VoiceInputControl({
  disabled = false,
  previewMode = false,
  iconColor,
  surface,
}: VoiceInputSlotProps) {
  const chat = surface === 'chat';
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Speech input"
        accessibilityState={{ disabled: true }}
        disabled
        style={chat ? styles.chatBtn : styles.btn}>
        <Mic
          size={chat ? 20 : 18}
          color={iconColor}
          opacity={disabled || previewMode ? 0.85 : 0.7}
          strokeWidth={1.5}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    flexShrink: 0,
  },
  btn: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    width: 36,
    height: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderRadius: 8,
  },
});
