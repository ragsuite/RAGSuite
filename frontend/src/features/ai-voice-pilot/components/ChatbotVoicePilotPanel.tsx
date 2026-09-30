import React, { useLayoutEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import { useChatbotVoicePilot } from '@/features/ai-voice-pilot/hooks/useChatbotVoicePilot';
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
  // Centered orb: size from body height, leave room for status + name (~72px).
  const available = Math.max(200, (contentHeight || 360) - 72);
  const orbSize = Math.min(240, Math.max(168, Math.round(available * 0.55)));

  const micBanner =
    micError === 'denied'
      ? t('voicePilot.error.micDenied')
      : micError === 'not_found' || micError === 'unsupported'
        ? t('chatbot.widget.voicePilot.noMicrophone', {
            defaultValue: 'No microphone found.',
          })
        : null;

  const audioLabel = resolveChatbotVoicePilotAudioStateLabel({
    sessionState,
    agentActive,
    previewMode,
  });
  const statusText = t(audioLabel.key, { defaultValue: audioLabel.fallback });
  const displayOrbName =
    (orbName || '').trim() ||
    t('chatbot.widget.voicePilot.orbName.fallback', { defaultValue: 'Assistant' });

  return (
    <View style={[styles.root, { backgroundColor }]}>
      {micBanner ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(185, 28, 28, 0.12)' }]}>
          <Text style={[styles.bannerText, { color: '#B91C1C' }]}>{micBanner}</Text>
        </View>
      ) : null}

      <View style={styles.orbWrap}>
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
        <Text style={[styles.hint, { color: mutedColor || '#9CA3AF' }]}>{statusText}</Text>
        <Text style={[styles.voiceName, { color: textColor || accentColor }]} numberOfLines={1}>
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
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  banner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
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
  },
  orbPress: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
  },
  voiceName: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  error: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
