import { Mic } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useWidgetCapabilities } from '@/platform/widget-capabilities';
import type { VoiceInputSlotProps } from '@/platform/extension-slots';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';

import { useSpeechToText } from './hooks/useSpeechToText';
import { voiceCopy } from './strings';
import { markLastInputAsVoice } from './voice-input-signal';
import { voiceInputTooltipPlacement } from './voice-input-tooltip';
import { prefersReducedMotion } from './web-speech';

const IS_WEB = Platform.OS === 'web';

export function VoiceInputControl({
  value,
  onChangeText,
  onVoiceCommitted,
  disabled = false,
  previewMode = false,
  language,
  iconColor,
  activeColor,
  surface,
}: VoiceInputSlotProps) {
  const { ready, hasStt } = useWidgetCapabilities();
  const copy = voiceCopy(language);
  /** STT capability on web — preview still paints a disabled mic for Live Preview chrome. */
  const capabilitiesOk = ready && hasStt && Platform.OS === 'web';
  const gated = capabilitiesOk && !previewMode;
  const [hovered, setHovered] = useState(false);
  const onVoiceCommittedRef = useRef(onVoiceCommitted);
  onVoiceCommittedRef.current = onVoiceCommitted;

  const handleTranscript = useCallback(
    (text: string) => {
      markLastInputAsVoice();
      onChangeText(text);
    },
    [onChangeText],
  );

  const handleUtteranceEnd = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Flush transcript into host state before submit.
    queueMicrotask(() => {
      onVoiceCommittedRef.current?.(trimmed);
    });
  }, []);

  const { supported, listening, error, toggle } = useSpeechToText({
    language,
    enabled: gated && !disabled,
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
  });
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!listening || prefersReducedMotion()) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: !IS_WEB,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: !IS_WEB,
        }),
      ]),
    );
    loop.start();
    return () => {
      try {
        loop.stop();
        pulse.stopAnimation();
        pulse.setValue(1);
      } catch {
        /* ignore animation teardown races */
      }
    };
  }, [listening, pulse]);

  if (!capabilitiesOk) return null;
  if (!previewMode && !supported) return null;

  const label = error === 'denied' ? copy.micDenied : listening ? copy.listening : copy.voiceInput;
  const chat = surface === 'chat';
  const tooltipPlacement = voiceInputTooltipPlacement(surface);
  const showTooltip = IS_WEB && hovered && !listening && !disabled && !previewMode;
  // Icon-only hover: tint the mic, never paint a border/background chrome.
  const color =
    listening || (hovered && !disabled && !previewMode) ? activeColor : iconColor;

  return (
    <View
      style={[
        styles.wrap,
        tooltipPlacement === 'beside' ? styles.wrapSearch : null,
        chat && showTooltip ? styles.wrapChatTooltipOpen : null,
      ]}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.tooltip,
            chat ? styles.tooltipChat : null,
            tooltipPlacement === 'beside'
              ? styles.tooltipBeside
              : chat
                ? styles.tooltipCenter
                : styles.tooltipStart,
          ]}>
          <Text style={styles.tooltipText} numberOfLines={1}>
            {copy.voiceInput}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected: listening }}
        disabled={disabled || previewMode}
        onPress={() => toggle(value)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        hitSlop={8}
        style={({ pressed }) => [
          chat ? styles.chatBtn : styles.searchBtn,
          {
            opacity: pressed ? 0.85 : 1,
            borderWidth: 0,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
          },
          IS_WEB
            ? ({
                cursor: 'pointer',
                outlineStyle: 'none',
                transitionProperty: 'opacity',
                transitionDuration: '160ms',
              } as object)
            : null,
        ]}>
        <Animated.View pointerEvents="none" style={{ transform: [{ scale: pulse }] }}>
          <Mic size={chat ? 20 : 18} color={color} strokeWidth={1.5} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    flexShrink: 0,
    ...(IS_WEB ? ({ overflow: 'visible' as const } as object) : null),
  },
  wrapSearch: {
    zIndex: 40,
  },
  wrapChatTooltipOpen: {
    zIndex: 50,
  },
  chatBtn: {
    width: 36,
    height: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderRadius: 8,
  },
  searchBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderRadius: 8,
    flexShrink: 0,
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'rgba(30,30,30,0.92)',
    zIndex: 30,
    ...(IS_WEB
      ? ({
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
        } as object)
      : null),
  },
  tooltipChat: {
    // Sit clearly above the composer shell without overlapping the input text.
    marginBottom: 8,
  },
  tooltipCenter: {
    left: '50%',
    ...(IS_WEB ? ({ transform: 'translateX(-50%)' } as object) : null),
  },
  tooltipStart: {
    left: 0,
  },
  tooltipBeside: {
    bottom: 'auto' as const,
    left: 'auto' as const,
    right: '100%',
    top: '50%',
    marginBottom: 0,
    marginRight: 6,
    ...(IS_WEB ? ({ transform: 'translateY(-50%)' } as object) : null),
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
});
