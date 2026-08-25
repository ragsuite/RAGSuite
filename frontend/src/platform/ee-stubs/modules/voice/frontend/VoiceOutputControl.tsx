import { Volume2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { VoiceOutputSlotProps } from '@/platform/extension-slots';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';

/** CE decorative speaker — overwritten when EE registers. */
export function VoiceOutputControl({ iconColor }: VoiceOutputSlotProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Speech output"
      accessibilityState={{ disabled: true }}
      disabled
      style={styles.btn}>
      <Volume2 size={14} color={iconColor} opacity={0.85} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
