import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowLeft, Pause, Play, Square } from 'lucide-react-native';

import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import type {
  VoicePilotVoice,
  VoicePilotVoiceConfig,
} from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  spherePaletteIndex,
  voiceAccentLabel,
} from '@/features/ai-voice-pilot/utils/voice-trending';

type Props = {
  voice: VoicePilotVoice;
  voiceIndex: number;
  voiceCount: number;
  draft: VoicePilotVoiceConfig;
  hasUnsaved: boolean;
  applying: boolean;
  previewBusy: boolean;
  playing: boolean;
  isPaused: boolean;
  isSelected: boolean;
  orbBands?: VoiceAudioBands;
  orbState: 'idle' | 'listening' | 'thinking' | 'speaking';
  onBack: () => void;
  onDraftChange: (patch: Partial<VoicePilotVoiceConfig>) => void;
  onResetDefaults: () => void;
  onApply: () => void;
  onPlayPreview: () => void;
  onStopPreview: () => void;
  onUseVoice: () => void;
};

/**
 * Per-voice configuration: white left orb card + sticky Apply footer.
 * Enter: left card slides from center; right card fades in.
 */
export function VoiceConfigurationWorkspace({
  voice,
  voiceIndex,
  voiceCount,
  draft,
  hasUnsaved,
  applying,
  previewBusy,
  playing,
  isPaused,
  isSelected,
  orbBands,
  orbState,
  onBack,
  onDraftChange,
  onResetDefaults,
  onApply,
  onPlayPreview,
  onStopPreview,
  onUseVoice,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, elevation } = useAppTheme();
  const { width, height: windowHeight } = useWindowDimensions();
  const wide = width >= 900;
  const accent = voiceAccentLabel(voice);
  const palette = spherePaletteIndex(voice.voice_id);
  const orbSize = wide ? 200 : 168;
  const cardMaxH = Math.min(560, Math.max(420, Math.round(windowHeight * 0.7)));

  const leftEnterX = useRef(new Animated.Value(0)).current;
  const leftOpacity = useRef(new Animated.Value(1)).current;
  const rightEnterX = useRef(new Animated.Value(0)).current;
  const rightOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fromX = wide ? Math.min(220, width * 0.28) : Math.min(80, width * 0.12);
    leftEnterX.setValue(fromX);
    leftOpacity.setValue(0.85);
    rightEnterX.setValue(24);
    rightOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(leftEnterX, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(leftOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(80),
        Animated.parallel([
          Animated.timing(rightEnterX, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(rightOpacity, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
    // Only on mount / voice identity for enter feel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.voice_id]);

  const fmt01 = (v: number) => String(Math.round(v * 100));
  const fmtSpeed = (v: number) => `${v.toFixed(2)}x`;

  const cardChrome = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: surfaceRadius.card ?? surfaceRadius.button,
    ...(elevation?.card ?? null),
  };

  const stickyLeftWeb =
    Platform.OS === 'web' && wide
      ? ({
          position: 'sticky',
          top: 12,
          alignSelf: 'flex-start',
          zIndex: 2,
        } as const)
      : null;

  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('voicePilot.voices.config.back.a11y')}
        onPress={onBack}
        style={({ pressed }) => [
          styles.backBtn,
          {
            opacity: pressed ? 0.7 : 1,
            gap: spacing.xs,
          },
        ]}>
        <ArrowLeft size={18} color={colors.text} />
        <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
          {t('voicePilot.voices.config.back')}
        </Text>
      </Pressable>

      <View
        style={[
          styles.layout,
          {
            flexDirection: wide ? 'row' : 'column',
            gap: spacing.lg,
            alignItems: wide ? 'flex-start' : 'stretch',
          },
        ]}>
        <Animated.View
          style={[
            styles.card,
            stickyLeftWeb,
            cardChrome,
            {
              width: wide ? 300 : '100%',
              padding: spacing.lg,
              gap: spacing.md,
              maxHeight: wide ? cardMaxH : undefined,
              opacity: leftOpacity,
              transform: [{ translateX: leftEnterX }],
            },
          ]}>
          <View
            style={[
              styles.orbBox,
              {
                width: orbSize + 16,
                height: orbSize + 16,
                alignSelf: 'center',
              },
            ]}>
            <AudioReactiveOrb
              size={orbSize}
              colorTheme={themeFromPaletteIndex(palette)}
              paletteIndex={palette}
              bands={orbBands}
              state={orbState}
              intensity={playing ? 0.9 : 0.5}
              quality="high"
              priority={110}
            />
          </View>

          <View style={{ gap: spacing.xxs, alignItems: 'center' }}>
            <Text style={[typography.subtitle, { color: colors.text, textAlign: 'center' }]}>
              {voice.name}
            </Text>
            {accent ? (
              <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
                {accent}
              </Text>
            ) : null}
            {voiceIndex >= 0 ? (
              <Text style={[typography.caption, { color: colors.textSoft }]}>
                {voiceIndex + 1} / {voiceCount}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              justifyContent: 'center',
            }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                playing && !isPaused
                  ? t('voicePilot.voices.pause.a11y', { name: voice.name })
                  : t('voicePilot.voices.config.playPreview')
              }
              disabled={previewBusy}
              onPress={onPlayPreview}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderRadius: surfaceRadius.button,
                  opacity: previewBusy ? 0.6 : 1,
                },
              ]}>
              {previewBusy ? (
                <ActivityIndicator color={colors.primary} />
              ) : playing && !isPaused ? (
                <Pause size={16} color={colors.primary} fill={colors.primary} />
              ) : (
                <Play size={16} color={colors.primary} fill={colors.primary} />
              )}
              <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                {playing && !isPaused
                  ? t('voicePilot.voices.pause')
                  : isPaused
                    ? t('voicePilot.voices.resume')
                    : t('voicePilot.voices.config.playPreview')}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('voicePilot.voices.config.stop')}
              disabled={!playing && !isPaused}
              onPress={onStopPreview}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderRadius: surfaceRadius.button,
                  opacity: !playing && !isPaused ? 0.4 : 1,
                },
              ]}>
              <Square size={14} color={colors.text} fill={colors.text} />
              <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                {t('voicePilot.voices.config.stop')}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onUseVoice}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: pressed
                    ? colors.primaryPressed ?? colors.primary
                    : colors.primary,
                  borderRadius: surfaceRadius.button,
                },
              ]}>
              <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '600' }]}>
                {isSelected ? t('voicePilot.voices.selected') : t('voicePilot.voices.useVoice')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            styles.rightCard,
            cardChrome,
            {
              flex: 1,
              padding: spacing.lg,
              maxWidth: wide ? undefined : '100%',
              maxHeight: cardMaxH,
              minHeight: wide ? Math.min(480, cardMaxH) : undefined,
              opacity: rightOpacity,
              transform: [{ translateX: rightEnterX }],
            },
          ]}>
          <View style={{ gap: spacing.xxs, marginBottom: spacing.sm, flexShrink: 0 }}>
            <Text style={[typography.subtitle, { color: colors.text }]}>
              {t('voicePilot.voices.config.title')}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('voicePilot.voices.config.subtitle')}
            </Text>
          </View>

          <ScrollView
            style={styles.sliderScroll}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
            nestedScrollEnabled
            showsVerticalScrollIndicator>
            <View style={{ gap: spacing.xxs }}>
              <AppRangeField
                label={t('voicePilot.voices.config.stability')}
                value={draft.stability}
                min={0}
                max={1}
                step={0.01}
                formatValue={fmt01}
                onChange={(stability) => onDraftChange({ stability })}
              />
              <Text style={[typography.caption, { color: colors.textSoft }]}>
                {t('voicePilot.voices.config.stability.help')}
              </Text>
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppRangeField
                label={t('voicePilot.voices.config.similarity')}
                value={draft.similarity_boost}
                min={0}
                max={1}
                step={0.01}
                formatValue={fmt01}
                onChange={(similarity_boost) => onDraftChange({ similarity_boost })}
              />
              <Text style={[typography.caption, { color: colors.textSoft }]}>
                {t('voicePilot.voices.config.similarity.help')}
              </Text>
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppRangeField
                label={t('voicePilot.voices.config.style')}
                value={draft.style}
                min={0}
                max={1}
                step={0.01}
                formatValue={fmt01}
                onChange={(style) => onDraftChange({ style })}
              />
              <Text style={[typography.caption, { color: colors.textSoft }]}>
                {t('voicePilot.voices.config.style.help')}
              </Text>
            </View>

            <View style={{ gap: spacing.xxs }}>
              <AppRangeField
                label={t('voicePilot.voices.config.speed')}
                value={draft.speed}
                min={0.7}
                max={1.2}
                step={0.05}
                formatValue={fmtSpeed}
                onChange={(speed) => onDraftChange({ speed })}
              />
              <Text style={[typography.caption, { color: colors.textSoft }]}>
                {t('voicePilot.voices.config.speed.help')}
              </Text>
            </View>

            <AppSwitchRow
              label={t('voicePilot.voices.config.speakerBoost')}
              description={t('voicePilot.voices.config.speakerBoost.help')}
              value={draft.use_speaker_boost}
              onChange={(use_speaker_boost) => onDraftChange({ use_speaker_boost })}
              bordered={false}
              transparentBackground
            />
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border,
                paddingTop: spacing.md,
                gap: spacing.sm,
                flexShrink: 0,
              },
            ]}>
            {hasUnsaved ? (
              <Text style={[typography.caption, { color: colors.primary }]}>
                {t('voicePilot.voices.config.unsaved')}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Pressable
                accessibilityRole="button"
                onPress={onResetDefaults}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderRadius: surfaceRadius.button,
                  },
                ]}>
                <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>
                  {t('voicePilot.voices.config.reset')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={applying || !hasUnsaved}
                onPress={onApply}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    borderColor: colors.primary,
                    backgroundColor: pressed
                      ? colors.primaryPressed ?? colors.primary
                      : colors.primary,
                    borderRadius: surfaceRadius.button,
                    opacity: applying || !hasUnsaved ? 0.55 : 1,
                    minWidth: 120,
                    justifyContent: 'center',
                  },
                ]}>
                {applying ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text
                    style={[typography.body, { color: colors.textOnPrimary, fontWeight: '600' }]}>
                    {t('voicePilot.voices.config.apply')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: 4,
  },
  layout: {
    width: '100%',
  },
  orbBox: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    minWidth: 0,
  },
  rightCard: {
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sliderScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 120,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
