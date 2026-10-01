import { Pause, Play, User } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const ROW_MAX_HEIGHT = 96;
const AVATAR_SIZE = 40;
const TAG_LIMIT = 3;

function genderAccent(gender: string, colors: ReturnType<typeof useAppTheme>['colors']) {
  const g = gender.toLowerCase();
  if (g === 'male') return colors.primary;
  if (g === 'female') return colors.danger;
  return colors.textMuted;
}

type Props = {
  voice: VoicePilotVoice;
  isActive: boolean;
  isPilotSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onSpeak: () => void;
  onConfirm: () => void;
};

export function CustomVoiceListRow({
  voice,
  isActive,
  isPilotSelected,
  isPlaying,
  onSelect,
  onSpeak,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const genderLabel = voice.gender || voice.labels?.gender || 'neutral';
  const langLabel = voice.language || voice.labels?.language || '';
  const ageLabel = voice.age || voice.labels?.age || 'Adult';
  const description = voice.description || voice.labels?.description || '';
  const tags = (voice.tags || []).filter(Boolean).slice(0, TAG_LIMIT);
  const accent = genderAccent(genderLabel, colors);
  const genderTitle = genderLabel.charAt(0).toUpperCase() + genderLabel.slice(1).toLowerCase();
  const playA11y = isPlaying
    ? t('voicePilot.voices.pause.a11y', { name: voice.name })
    : t('voicePilot.voices.play.a11y', { name: voice.name });

  return (
    <View
      style={[
        styles.voiceRow,
        {
          maxHeight: ROW_MAX_HEIGHT,
          borderColor: isActive ? colors.primary : colors.border,
          backgroundColor: isActive ? colors.primaryTint : colors.surface,
          borderRadius: surfaceRadius.card,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          gap: spacing.md,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onSelect}
        style={({ pressed, hovered }) => [
          styles.voiceRowMain,
          {
            gap: spacing.md,
            backgroundColor: pressed || hovered ? colors.surfaceMuted : 'transparent',
            borderRadius: surfaceRadius.button,
          },
        ]}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: accent,
            },
          ]}>
          <User size={18} color={accent} />
        </View>

        <View style={styles.voiceRowCenter}>
          <View style={styles.nameTagsRow}>
            <Text
              numberOfLines={1}
              style={[typography.body, styles.nameText, { color: colors.text }]}>
              {voice.name}
            </Text>
            <View style={styles.tagsRow}>
              {tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.button,
                    },
                  ]}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
          {description ? (
            <Text
              numberOfLines={1}
              style={[typography.caption, { color: colors.textSoft, marginTop: 2 }]}>
              {description}
            </Text>
          ) : null}
        </View>

        <View style={[styles.voiceRowMeta, { marginLeft: spacing.sm }]}>
          {langLabel ? (
            <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
              {langLabel}
            </Text>
          ) : null}
          <View
            style={[
              styles.genderPill,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <View style={[styles.genderDot, { backgroundColor: accent }]} />
            <Text numberOfLines={1} style={[typography.caption, { color: colors.text }]}>
              {genderTitle}
              {' · '}
              {ageLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={[styles.voiceRowActions, { gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playA11y}
          onPress={onSpeak}
          style={({ pressed, hovered }) => [
            styles.playBtn,
            {
              borderColor: colors.border,
              backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
              borderRadius: surfaceRadius.button,
            },
          ]}>
          {isPlaying ? (
            <Pause size={16} color={colors.primary} fill={colors.primary} />
          ) : (
            <Play size={16} color={colors.primary} fill={colors.primary} />
          )}
        </Pressable>
        <AppButton
          variant={isPilotSelected ? 'secondary' : 'primary'}
          size="compact"
          label={
            isPilotSelected ? t('voicePilot.voices.selected') : t('voicePilot.voices.useVoice')
          }
          onPress={onConfirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  voiceRow: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  voiceRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceRowCenter: {
    flex: 1,
    minWidth: 0,
  },
  nameTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  nameText: {
    flexShrink: 1,
    maxWidth: '42%',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  tagChip: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  voiceRowMeta: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
    maxWidth: 130,
  },
  genderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  genderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  voiceRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
