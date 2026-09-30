import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Pause, Play } from 'lucide-react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  voiceName: string;
  playing: boolean;
  paused: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoicePlaybackBar({
  voiceName,
  playing,
  paused,
  currentTime,
  duration,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const showPause = playing && !paused;

  return (
    <View
      style={[
        styles.bar,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
          gap: spacing.sm,
          ...Platform.select({
            web: {
              position: 'sticky',
              bottom: 0,
              zIndex: 4,
              boxShadow: '0 -4px 16px rgba(22, 39, 31, 0.08)',
            } as object,
            default: {},
          }),
        },
      ]}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primaryTint, borderColor: colors.border },
          ]}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
            {voiceName}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('voicePilot.voices.playback.subtitle')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showPause ? t('voicePilot.voices.pause') : t('voicePilot.voices.speakPreview')
          }
          onPress={onToggle}
          style={({ pressed }) => [
            styles.playBtn,
            {
              backgroundColor: pressed ? colors.primaryPressed ?? colors.primary : colors.primary,
              borderRadius: 22,
            },
          ]}>
          {showPause ? (
            <Pause size={18} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
          ) : (
            <Play size={18} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
          )}
        </Pressable>
      </View>

      <View style={[styles.progressRow, { gap: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textSoft, width: 36 }]}>
          {formatTime(currentTime)}
        </Text>
        <View
          style={[
            styles.track,
            { backgroundColor: colors.surfaceMuted, borderRadius: 2, flex: 1 },
          ]}>
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <Text style={[typography.caption, { color: colors.textSoft, width: 36, textAlign: 'right' }]}>
          {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  playBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    height: 4,
    overflow: 'hidden',
  },
});
