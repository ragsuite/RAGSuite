import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CheckCircle2, UserRound, UserRoundCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { VoicePlayProgressButton } from '@/features/ai-voice-pilot/components/VoicePlayProgressButton';
import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
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

function GenderAvatarIcon({
  gender,
  color,
  size = 20,
}: {
  gender: string;
  color: string;
  size?: number;
}) {
  const g = gender.toLowerCase();
  if (g === 'male') {
    return <MaterialCommunityIcons name="human-male-boy" size={size} color={color} />;
  }
  if (g === 'female') {
    return <MaterialCommunityIcons name="human-female-girl" size={size} color={color} />;
  }
  return <UserRound size={size} color={color} />;
}

type Props = {
  voice: VoicePilotVoice;
  isActive: boolean;
  isPilotSelected: boolean;
  isPlaying: boolean;
  /** 0–1 sample playback progress for this row’s play button ring. */
  playbackProgress?: number;
  /** Hide tags / shrink meta when the panel is narrow. */
  compact?: boolean;
  onSelect: () => void;
  onSpeak: () => void;
  onConfirm: () => void;
};

export function CustomVoiceListRow({
  voice,
  isActive,
  isPilotSelected,
  isPlaying,
  playbackProgress = 0,
  compact = false,
  onSelect,
  onSpeak,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const rawGender = (voice.gender || voice.labels?.gender || 'neutral').toLowerCase();
  const genderLabel =
    rawGender === 'male'
      ? t('voicePilot.custom.male')
      : rawGender === 'female'
        ? t('voicePilot.custom.female')
        : rawGender === 'neutral'
          ? t('voicePilot.custom.neutral')
          : voice.gender || voice.labels?.gender || t('voicePilot.custom.neutral');
  const langLabel = voice.language || voice.labels?.language || '';
  const ageLabel = voice.age || voice.labels?.age || '';
  const description = voice.description || voice.labels?.description || '';
  const tags = compact ? [] : (voice.tags || []).filter(Boolean).slice(0, TAG_LIMIT);
  const accent = genderAccent(rawGender, colors);
  const playA11y = isPlaying
    ? t('voicePilot.voices.pause.a11y', { name: voice.name })
    : t('voicePilot.voices.play.a11y', { name: voice.name });

  const cardRadius = surfaceRadius.card ?? surfaceRadius.button;
  const rowBackground = isActive
    ? colors.primaryTint
    : hovered
      ? colors.surfaceMuted
      : colors.surface;

  const webHoverHandlers =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        } as object)
      : null;

  return (
    <View
      {...webHoverHandlers}
      style={[
        styles.voiceRow,
        {
          maxHeight: ROW_MAX_HEIGHT,
          borderColor: isActive ? colors.primary : colors.border,
          backgroundColor: rowBackground,
          borderRadius: cardRadius,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          gap: spacing.sm,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onSelect}
        style={({ pressed }) => [
          styles.voiceRowMain,
          {
            gap: spacing.md,
            opacity: pressed ? 0.92 : 1,
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
          <GenderAvatarIcon gender={rawGender} color={accent} size={20} />
        </View>

        <View style={styles.voiceRowCenter}>
          <View style={styles.nameTagsRow}>
            <Text
              numberOfLines={1}
              style={[typography.body, styles.nameText, { color: colors.text }]}>
              {voice.name}
            </Text>
            {tags.length > 0 ? (
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
            ) : null}
          </View>
          {description ? (
            <Text
              numberOfLines={1}
              style={[typography.caption, { color: colors.textSoft, marginTop: 2 }]}>
              {description}
            </Text>
          ) : null}
        </View>

        <View style={[styles.voiceRowMeta, compact ? styles.voiceRowMetaCompact : null, { marginLeft: spacing.sm }]}>
          {langLabel && !compact ? (
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
            <GenderAvatarIcon gender={rawGender} color={accent} size={14} />
            <Text numberOfLines={1} style={[typography.caption, { color: colors.text }]}>
              {genderLabel}
              {!compact && ageLabel ? (
                <>
                  {' · '}
                  {ageLabel}
                </>
              ) : null}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={[styles.voiceRowActions, { gap: spacing.xs }]}>
        <VoicePlayProgressButton
          playing={isPlaying}
          progress={playbackProgress}
          accessibilityLabel={playA11y}
          onPress={onSpeak}
        />
        {isPilotSelected ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={t('voicePilot.voices.selected')}
            style={[
              styles.iconActionBtn,
              {
                borderColor: colors.success,
                backgroundColor: colors.primaryTint,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <CheckCircle2 size={18} color={colors.success} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.useVoice')}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.iconActionBtn,
              {
                borderColor: colors.primary,
                backgroundColor: pressed ? colors.primaryPressed ?? colors.primary : colors.primary,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <UserRoundCheck size={18} color={colors.textOnPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  voiceRow: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  voiceRowMetaCompact: {
    maxWidth: 96,
  },
  genderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  voiceRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconActionBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
