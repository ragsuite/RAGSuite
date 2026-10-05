import React, { useLayoutEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import { useChatbotVoicePilot } from '@/features/ai-voice-pilot/hooks/useChatbotVoicePilot';
import { useVoicePilotContentWidth } from '@/features/ai-voice-pilot/hooks/useVoicePilotContentWidth';
import { spherePaletteIndex } from '@/features/ai-voice-pilot/utils/voice-trending';
import { resolveChatbotVoicePilotAudioStateLabel } from '@/features/app-chat-widget/utils/chatbot-voice-pilot-audio-state';
import type { ChatWidgetVoicePilotPanelProps } from '@/platform/extension-slots';
import { useTranslation } from '@/i18n';

export function ChatbotVoicePilotPanel({
  previewMode,
  projectId: projectIdProp,
  accentColor,
  textColor,
  mutedColor,
  backgroundColor,
  language,
  contentHeight,
  orbName,
  onReady,
}: ChatWidgetVoicePilotPanelProps) {
  const { t } = useTranslation();
  const { width: contentWidth, onLayout } = useVoicePilotContentWidth();
  const {
    loading,
    bootstrap,
    error,
    micError,
    sessionState,
    agentActive,
    orbBands,
    orbIntensity,
    orbVisualState,
    voiceId,
    onOrbPress,
    submitText,
  } = useChatbotVoicePilot({ previewMode, language, projectId: projectIdProp });

  // Stable host API: always call the latest submitText without noop cleanup races.
  const submitTextRef = useRef(submitText);
  submitTextRef.current = submitText;

  useLayoutEffect(() => {
    if (!onReady) return;
    onReady({
      submitText: (text: string) => {
        submitTextRef.current(text);
      },
    });
  }, [onReady]);

  const paletteIndex = spherePaletteIndex(voiceId || 'pilot');
  const theme = themeFromPaletteIndex(paletteIndex);
  // Centered orb: size from body height and panel width; leave room for status + name.
  const availableH = Math.max(160, (contentHeight || 360) - 72);
  const availableW = Math.max(120, (contentWidth || 280) - 32);
  const orbSize = Math.min(240, availableW, Math.max(140, Math.round(availableH * 0.55)));
  const narrow = availableW < 280;

  const micBanner =
    micError === 'denied'
      ? t('voicePilot.error.micDenied')
      : micError === 'not_found' || micError === 'unsupported'
        ? t('chatbot.widget.voicePilot.noMicrophone')
        : null;

  const audioLabel = resolveChatbotVoicePilotAudioStateLabel({
    sessionState,
    agentActive,
    previewMode,
  });
  const statusText = t(audioLabel.key, { defaultValue: audioLabel.fallback });
  const displayOrbName =
    (orbName || '').trim() || t('chatbot.widget.voicePilot.orbName.fallback');

  return (
    <View style={[styles.root, { backgroundColor }]} onLayout={onLayout}>
      {micBanner ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(185, 28, 28, 0.12)' }]}>
          <Text style={[styles.bannerText, { color: '#B91C1C' }]}>{micBanner}</Text>
        </View>
      ) : null}

      <View style={[styles.orbWrap, narrow ? styles.orbWrapNarrow : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={statusText}
          disabled={previewMode || loading || !bootstrap?.voice_id}
          onPress={onOrbPress}
          style={styles.orbPress}
        >
          <AudioReactiveOrb
            size={orbSize}
            state={orbVisualState}
            colorTheme={theme}
            paletteIndex={paletteIndex}
            bands={orbBands}
            intensity={orbIntensity}
            priority={100}
            quality="high"
          />
        </Pressable>
        <Text
          style={[styles.hint, narrow ? styles.hintNarrow : null, { color: mutedColor || '#9CA3AF' }]}
          numberOfLines={2}>
          {statusText}
        </Text>
        <Text
          style={[styles.voiceName, { color: textColor || accentColor }]}
          numberOfLines={1}>
          {displayOrbName}
        </Text>
        {error && !micBanner ? (
          <Text style={[styles.error, { color: '#B91C1C' }]} numberOfLines={3}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  orbWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
    width: '100%',
    maxWidth: '100%',
  },
  orbWrapNarrow: {
    gap: 8,
    paddingHorizontal: 4,
  },
  orbPress: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    maxWidth: '100%',
  },
  hintNarrow: {
    fontSize: 13,
  },
  voiceName: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
    textAlign: 'center',
    paddingHorizontal: 8,
    maxWidth: '100%',
  },
  error: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
});
