import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioLines, Check, Pause, Play, Plus, UserCheck } from 'lucide-react-native';

import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import {
  spherePaletteIndex,
  voiceAccentLabel,
  voiceUseCaseLabel,
} from '@/features/ai-voice-pilot/utils/voice-trending';

const SPHERE_PALETTES = [
  ['#1E3A30', '#2E6A4E'],
  ['#B6802E', '#D4A24A'],
  ['#16271F', '#2E6A4E'],
  ['#A23B2E', '#C45A48'],
  ['#57544C', '#6E6A5C'],
  ['#2E6A4E', '#4A8A68'],
] as const;

type Props = {
  voices: VoicePilotVoice[];
  trendingIds: Set<string>;
  selectedVoiceId: string | null;
  playingVoiceId: string | null;
  isPaused: boolean;
  onAddToTrending: (voice: VoicePilotVoice) => void;
  onTogglePreview: (voice: VoicePilotVoice) => void;
  onSelectForPilot: (voice: VoicePilotVoice) => void;
};

function ActionIcon({
  label,
  onPress,
  children,
  disabled,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { colors, surfaceRadius } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      {...(Platform.OS === 'web' ? ({ title: label } as object) : null)}
      style={({ pressed, hovered }) => [
        styles.action,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
          opacity: disabled ? 0.55 : 1,
        },
      ]}>
      {children}
    </Pressable>
  );
}

export function VoiceWorkingList({
  voices,
  trendingIds,
  selectedVoiceId,
  playingVoiceId,
  isPaused,
  onAddToTrending,
  onTogglePreview,
  onSelectForPilot,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const showActionsAlways = Platform.OS !== 'web';

  if (voices.length === 0) {
    return (
      <Text style={[typography.body, { color: colors.textMuted }]}>
        {t('voicePilot.voices.workingEmpty')}
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.subtitle, { color: colors.text }]}>
        {t('voicePilot.voices.workingTitle')}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>
        {t('voicePilot.voices.workingSubtitle', { count: voices.length })}
      </Text>

      {voices.map((voice) => {
        const inTrending = trendingIds.has(voice.voice_id);
        const isSelected = selectedVoiceId === voice.voice_id;
        const isPlaying = playingVoiceId === voice.voice_id && !isPaused;
        const showActions = showActionsAlways || hoveredId === voice.voice_id;
        const palette = SPHERE_PALETTES[spherePaletteIndex(voice.voice_id)];
        const accent = voiceAccentLabel(voice);
        const useCase = voiceUseCaseLabel(voice);

        return (
          <Pressable
            key={voice.voice_id}
            onHoverIn={() => setHoveredId(voice.voice_id)}
            onHoverOut={() => setHoveredId((cur) => (cur === voice.voice_id ? null : cur))}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                padding: spacing.sm,
                gap: spacing.sm,
              },
            ]}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: palette[1],
                  borderColor: palette[0],
                },
              ]}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                {voice.name}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {[accent, useCase].filter(Boolean).join(' · ') || t('voicePilot.voices.naturalFallback')}
              </Text>
            </View>

            {showActions ? (
              <View style={[styles.actions, { gap: spacing.xxs }]}>
                <ActionIcon
                  label={
                    inTrending
                      ? t('voicePilot.voices.action.alreadyTrending')
                      : t('voicePilot.voices.action.addTrending')
                  }
                  onPress={() => {
                    if (!inTrending) onAddToTrending(voice);
                  }}
                  disabled={inTrending}>
                  {inTrending ? (
                    <Check size={16} color={colors.success} />
                  ) : (
                    <Plus size={16} color={colors.primary} />
                  )}
                </ActionIcon>
                <ActionIcon
                  label={
                    isPlaying
                      ? t('voicePilot.voices.pause.a11y', { name: voice.name })
                      : t('voicePilot.voices.play.a11y', { name: voice.name })
                  }
                  onPress={() => onTogglePreview(voice)}>
                  {isPlaying ? (
                    <Pause size={16} color={colors.primary} />
                  ) : (
                    <Play size={16} color={colors.primary} />
                  )}
                </ActionIcon>
                <ActionIcon
                  label={
                    isSelected
                      ? t('voicePilot.voices.selected')
                      : t('voicePilot.voices.action.selectPilot')
                  }
                  onPress={() => onSelectForPilot(voice)}>
                  {isSelected ? (
                    <UserCheck size={16} color={colors.success} />
                  ) : (
                    <AudioLines size={16} color={colors.primary} />
                  )}
                </ActionIcon>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 56,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  action: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
