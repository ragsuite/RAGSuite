import { Pause, Play } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

const SIZE = 40;
/** Full stroke stays inside the square (avoids overflow clipping). */
const STROKE = 4;
const INSET = STROKE;

type Props = {
  playing: boolean;
  /** 0–1 playback progress; square border fills when > 0 or playing. */
  progress?: number;
  accessibilityLabel: string;
  onPress: () => void;
};

function roundedRectPerimeter(width: number, height: number, radius: number): number {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return 2 * (width + height - 2 * r) + 2 * Math.PI * r;
}

/** Play/pause control with a clear square progress border (same button chrome). */
export function VoicePlayProgressButton({
  playing,
  progress = 0,
  accessibilityLabel,
  onPress,
}: Props) {
  const { colors, surfaceRadius } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const showProgress = playing || clamped > 0.001;

  const outerRadius =
    typeof surfaceRadius.button === 'number' ? surfaceRadius.button : 8;
  const rectSize = SIZE - INSET * 2;
  const cornerRadius = Math.min(Math.max(outerRadius - INSET * 0.35, 4), rectSize / 2);
  const perimeter = useMemo(
    () => roundedRectPerimeter(rectSize, rectSize, cornerRadius),
    [rectSize, cornerRadius],
  );
  const dashOffset = perimeter * (1 - clamped);
  // Soft track so remaining arc is still readable.
  const trackColor = colors.primaryTint ?? colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.hit,
        {
          borderColor: showProgress ? colors.primary : colors.border,
          borderWidth: showProgress ? 0 : 1,
          backgroundColor: pressed || hovered
            ? colors.surfaceMuted
            : showProgress
              ? colors.surfaceMuted
              : colors.surface,
          borderRadius: outerRadius,
        },
      ]}>
      {showProgress ? (
        <View style={styles.ringWrap} pointerEvents="none">
          <Svg width={SIZE} height={SIZE}>
            <Rect
              x={INSET}
              y={INSET}
              width={rectSize}
              height={rectSize}
              rx={cornerRadius}
              ry={cornerRadius}
              stroke={trackColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Rect
              x={INSET}
              y={INSET}
              width={rectSize}
              height={rectSize}
              rx={cornerRadius}
              ry={cornerRadius}
              stroke={colors.primary}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${perimeter} ${perimeter}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : null}
      <View style={styles.icon}>
        {playing ? (
          <Pause size={18} color={colors.primary} fill={colors.primary} />
        ) : (
          <Play size={18} color={colors.primary} style={styles.playIcon} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  playIcon: {
    marginLeft: 1,
  },
});
