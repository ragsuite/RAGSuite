import React, { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react-native';

import { VoiceCarouselOrbs } from '@/features/ai-voice-pilot/components/VoiceCarouselOrbs';
import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import { voiceAccentLabel } from '@/features/ai-voice-pilot/utils/voice-trending';

type Props = {
  voices: VoicePilotVoice[];
  selectedVoiceId: string | null;
  activeIndex: number;
  playingVoiceId: string | null;
  isPaused: boolean;
  playbackSource: 'sample' | 'typed' | null;
  orbBands?: VoiceAudioBands;
  /** Override carousel heading (defaults to trending copy). */
  title?: string;
  subtitle?: string;
  onSelectIndex: (index: number) => void;
  onToggleSample: (voice: VoicePilotVoice) => void;
  onSpeakTyped: (voice: VoicePilotVoice) => void;
  onConfirm: (voice: VoicePilotVoice) => void;
  /** When omitted, Voice Configuration button is hidden (e.g. Custom provider). */
  onOpenConfiguration?: (voice: VoicePilotVoice) => void;
  /** When false, hide Speak preview action (e.g. Custom — orb play covers it). Default true. */
  showSpeakPreview?: boolean;
};

function useCarouselMetrics() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const itemSize = compact ? 128 : 160;
  const visibleSlots = compact ? 3 : 5;
  return { itemSize, visibleSlots, compact };
}

/**
 * Voices carousel: one WebGL canvas + Three.js group slide.
 * Chevrons/keyboard select index; slide is entirely in Three.js (no Animated track).
 */
export function VoiceSpherePicker({
  voices,
  selectedVoiceId,
  activeIndex,
  playingVoiceId,
  isPaused,
  playbackSource,
  orbBands,
  title,
  subtitle,
  onSelectIndex,
  onToggleSample,
  onSpeakTyped,
  onConfirm,
  onOpenConfiguration,
  showSpeakPreview = true,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { itemSize, visibleSlots } = useCarouselMetrics();
  const heading = title ?? t('voicePilot.voices.trendingTitle');
  const subheading = subtitle ?? t('voicePilot.voices.trendingSubtitle');

  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(voices.length - 1, 0));
  const activeVoice = voices[safeIndex] ?? null;
  const typedActive = Boolean(
    activeVoice && playingVoiceId === activeVoice.voice_id && playbackSource === 'typed',
  );
  const typedPlaying = typedActive && !isPaused;
  const anyPlaying =
    Boolean(activeVoice) &&
    playingVoiceId === activeVoice!.voice_id &&
    !isPaused &&
    Boolean(playbackSource);

  const viewportWidth = itemSize * visibleSlots;
  const viewportHeight = itemSize + 16;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && safeIndex > 0) {
        e.preventDefault();
        onSelectIndex(safeIndex - 1);
      } else if (e.key === 'ArrowRight' && safeIndex < voices.length - 1) {
        e.preventDefault();
        onSelectIndex(safeIndex + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectIndex, safeIndex, voices.length]);

  if (!activeVoice) return null;

  const canPrev = safeIndex > 0;
  const canNext = safeIndex < voices.length - 1;
  const isSelected = selectedVoiceId === activeVoice.voice_id;
  const accent = voiceAccentLabel(activeVoice);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.subtitle, { color: colors.text }]}>{heading}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{subheading}</Text>

      <View style={[styles.carouselRow, { gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voicePilot.voices.prev.a11y')}
          disabled={!canPrev}
          onPress={() => canPrev && onSelectIndex(safeIndex - 1)}
          style={({ pressed }) => [
            styles.chevron,
            {
              opacity: canPrev ? (pressed ? 0.7 : 1) : 0.3,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: surfaceRadius.button,
            },
          ]}>
          <ChevronLeft size={18} color={colors.text} />
        </Pressable>

        <View style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}>
          <VoiceCarouselOrbs
            voices={voices}
            activeIndex={safeIndex}
            width={viewportWidth}
            height={viewportHeight}
            visibleSlots={visibleSlots}
            playing={anyPlaying}
            orbBands={orbBands}
            onPressActive={() => onToggleSample(activeVoice)}
            onPressNeighbor={onSelectIndex}
          />
          <View
            pointerEvents="none"
            style={[
              styles.playBadge,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                // Center-slot badge (middle of visible window).
                left: ((visibleSlots - 1) / 2) * itemSize + itemSize - 38,
                bottom: 12,
              },
            ]}>
            {anyPlaying ? (
              <Pause size={14} color={colors.primary} fill={colors.primary} />
            ) : (
              <Play size={14} color={colors.primary} fill={colors.primary} />
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voicePilot.voices.next.a11y')}
          disabled={!canNext}
          onPress={() => canNext && onSelectIndex(safeIndex + 1)}
          style={({ pressed }) => [
            styles.chevron,
            {
              opacity: canNext ? (pressed ? 0.7 : 1) : 0.3,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: surfaceRadius.button,
            },
          ]}>
          <ChevronRight size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md }}>
        <Text style={[typography.body, { color: colors.text, textAlign: 'center' }]}>
          {activeVoice.name}
        </Text>
        {accent ? (
          <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
            {accent}
          </Text>
        ) : null}
        <Text style={[typography.caption, { color: colors.textSoft }]}>
          {safeIndex + 1} / {voices.length}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}>
        {showSpeakPreview ? (
          <Pressable
            onPress={() => onSpeakTyped(activeVoice)}
            style={({ pressed, hovered }) => [
              styles.actionBtn,
              {
                borderColor: colors.border,
                backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <Text style={[typography.body, { color: colors.text }]}>
              {typedPlaying
                ? t('voicePilot.voices.pause')
                : typedActive && isPaused
                  ? t('voicePilot.voices.resume')
                  : t('voicePilot.voices.speakPreview')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onConfirm(activeVoice)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primaryPressed ?? colors.primary : colors.primary,
              borderRadius: surfaceRadius.button,
            },
          ]}>
          <Text style={[typography.body, { color: colors.textOnPrimary }]}>
            {isSelected ? t('voicePilot.voices.selected') : t('voicePilot.voices.useVoice')}
          </Text>
        </Pressable>
        {onOpenConfiguration ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.config.open.a11y', {
              name: activeVoice.name,
            })}
            onPress={() => onOpenConfiguration(activeVoice)}
            style={({ pressed, hovered }) => [
              styles.actionBtn,
              {
                borderColor: colors.border,
                backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <Text style={[typography.body, { color: colors.text }]}>
              {t('voicePilot.voices.config.open')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewport: {
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
