import React, { useEffect, useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SlidersHorizontal,
  UserRoundCheck,
} from 'lucide-react-native';

import { VoiceCarouselOrbs } from '@/features/ai-voice-pilot/components/VoiceCarouselOrbs';
import {
  useVoicePilotContentWidth,
  voiceCarouselMetrics,
} from '@/features/ai-voice-pilot/hooks/useVoicePilotContentWidth';
import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  voiceCarouselCenterOrbLabel,
  voiceCarouselDescription,
  voiceCarouselNeighborTitle,
} from '@/features/ai-voice-pilot/utils/voice-trending';

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
  onConfirm: (voice: VoicePilotVoice) => void;
  /** When omitted, Voice Configuration button is hidden (e.g. Custom provider). */
  onOpenConfiguration?: (voice: VoicePilotVoice) => void;
};

const PLAY_SIZE = 54;
const DETAIL_MAX_WIDTH = 340;

/**
 * Voices carousel — reference layout: orbs, per-slot labels, centered detail, chevron nav, actions.
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
  onConfirm,
  onOpenConfiguration,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { width: contentWidth, onLayout } = useVoicePilotContentWidth();
  const { itemSize, visibleSlots } = useMemo(
    () => voiceCarouselMetrics(contentWidth),
    [contentWidth],
  );
  const heading = title ?? t('voicePilot.voices.trendingTitle');
  const subheading = subtitle ?? t('voicePilot.voices.trendingSubtitle');

  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(voices.length - 1, 0));
  const activeVoice = voices[safeIndex] ?? null;
  const sampleActive = Boolean(
    activeVoice && playingVoiceId === activeVoice.voice_id && playbackSource === 'sample',
  );
  const samplePlaying = sampleActive && !isPaused;
  const anyPlaying =
    Boolean(activeVoice) &&
    playingVoiceId === activeVoice!.voice_id &&
    !isPaused &&
    Boolean(playbackSource);

  const viewportWidth = itemSize * visibleSlots;
  const viewportHeight = itemSize + 20;
  const itemW = viewportWidth / visibleSlots;
  const half = Math.floor(visibleSlots / 2);
  const centerSlot = half;

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
  const centerDescription = voiceCarouselDescription(activeVoice);

  return (
    <View style={{ gap: spacing.lg, width: '100%' }} onLayout={onLayout}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.subtitle, { color: colors.text, fontWeight: '700' }]}>
          {heading}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
          {subheading}
        </Text>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.sm, width: '100%', overflow: 'hidden' }}>
        <View
          style={[
            styles.viewport,
            { width: Math.min(viewportWidth, contentWidth || viewportWidth), height: viewportHeight },
          ]}>
          <VoiceCarouselOrbs
            voices={voices}
            activeIndex={safeIndex}
            width={Math.min(viewportWidth, contentWidth || viewportWidth)}
            height={viewportHeight}
            visibleSlots={visibleSlots}
            playing={anyPlaying}
            orbBands={orbBands}
            onPressActive={() => onToggleSample(activeVoice)}
            onPressNeighbor={onSelectIndex}
          />
          {/* Center play over the active orb slot — flex-centered in the middle column */}
          <View
            pointerEvents="box-none"
            style={[
              styles.playSlot,
              {
                left: centerSlot * itemW,
                width: itemW,
                height: viewportHeight,
              },
            ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                samplePlaying
                  ? t('voicePilot.voices.pause')
                  : sampleActive && isPaused
                    ? t('voicePilot.voices.resume')
                    : t('voicePilot.voices.play.a11y', { name: activeVoice.name })
              }
              onPress={() => onToggleSample(activeVoice)}
              style={({ pressed }) => [
                styles.centerPlay,
                {
                  width: PLAY_SIZE,
                  height: PLAY_SIZE,
                  borderRadius: PLAY_SIZE / 2,
                  backgroundColor: '#ffffff',
                  opacity: pressed ? 0.9 : 1,
                  ...(Platform.OS === 'web'
                    ? ({ boxShadow: '0 2px 12px rgba(0,0,0,0.12)' } as object)
                    : null),
                },
              ]}>
              {samplePlaying ? (
                <Pause size={22} color="#1a1a1a" fill="#1a1a1a" />
              ) : (
                <Play size={22} color="#1a1a1a" style={styles.playIcon} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.labelRow, { width: viewportWidth, marginTop: -spacing.xs }]}>
          {Array.from({ length: visibleSlots }).map((_, i) => {
            const voiceIndex = safeIndex - half + i;
            const voice = voices[voiceIndex];
            const isCenter = voiceIndex === safeIndex;
            if (!voice) {
              return <View key={`lbl-${i}`} style={{ width: itemW }} />;
            }
            return (
              <View key={voice.voice_id} style={[styles.labelCell, { width: itemW }]}>
                <Text
                  numberOfLines={1}
                  style={[
                    isCenter ? typography.body : typography.caption,
                    {
                      color: isCenter ? colors.text : colors.textSoft,
                      fontWeight: isCenter ? '700' : '400',
                      textAlign: 'center',
                      fontSize: isCenter ? 15 : 13,
                    },
                  ]}>
                  {isCenter
                    ? voiceCarouselCenterOrbLabel(voice)
                    : voiceCarouselNeighborTitle(voice, 20)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.detailBlock, { maxWidth: DETAIL_MAX_WIDTH, gap: spacing.xxs }]}>
          <Text
            numberOfLines={1}
            style={[
              typography.body,
              {
                color: colors.text,
                fontWeight: '700',
                textAlign: 'center',
                fontSize: 16,
              },
            ]}>
            {activeVoice.name}
          </Text>
          {centerDescription ? (
            <Text
              numberOfLines={2}
              style={[
                typography.caption,
                {
                  color: colors.textMuted,
                  textAlign: 'center',
                  lineHeight: 18,
                },
              ]}>
              {centerDescription}
            </Text>
          ) : null}
        </View>

        <View style={[styles.navRow, { gap: spacing.md, marginTop: spacing.xxs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.prev.a11y')}
            disabled={!canPrev}
            onPress={() => canPrev && onSelectIndex(safeIndex - 1)}
            style={({ pressed }) => [
              styles.chevron,
              {
                opacity: canPrev ? (pressed ? 0.75 : 1) : 0.35,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <ChevronLeft size={20} color={colors.text} />
          </Pressable>

          <View style={styles.navMeta}>
            <Text
              style={[
                typography.caption,
                { color: colors.textSoft, textAlign: 'center', fontSize: 13 },
              ]}>
              {safeIndex + 1} / {voices.length}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.next.a11y')}
            disabled={!canNext}
            onPress={() => canNext && onSelectIndex(safeIndex + 1)}
            style={({ pressed }) => [
              styles.chevron,
              {
                opacity: canNext ? (pressed ? 0.75 : 1) : 0.35,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <ChevronRight size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.actionRow, { gap: spacing.sm }]}>
        {isSelected ? (
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
            <CheckCircle2 size={20} color={colors.success} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.useVoice')}
            onPress={() => onConfirm(activeVoice)}
            style={({ pressed }) => [
              styles.iconActionBtn,
              {
                borderColor: colors.primary,
                backgroundColor: pressed ? colors.primaryPressed ?? colors.primary : colors.primary,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <UserRoundCheck size={20} color={colors.textOnPrimary} />
          </Pressable>
        )}
        {onOpenConfiguration ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voicePilot.voices.config.open.a11y', {
              name: activeVoice.name,
            })}
            onPress={() => onOpenConfiguration(activeVoice)}
            style={({ pressed, hovered }) => [
              styles.iconActionBtn,
              {
                borderColor: colors.border,
                backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <SlidersHorizontal size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'visible',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  playSlot: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  centerPlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    // Lucide Play glyph is optically left-heavy; nudge so triangle reads centered.
    marginLeft: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelCell: {
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  detailBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navMeta: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chevron: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  iconActionBtn: {
    borderWidth: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
