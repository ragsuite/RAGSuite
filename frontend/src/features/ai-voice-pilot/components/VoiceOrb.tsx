import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { SPECTRUM_BANDS } from '@/features/ai-voice-pilot/utils/voice-audio-session';

/**
 * Bright frosted-glass palettes (ElevenLabs-inspired):
 * orange/coral, pink–cyan, warm brown/crimson, teal, magenta-gold, ice-blue.
 */
export const VOICE_ORB_PALETTES = [
  ['#C2410C', '#F97316', '#FDBA74'],
  ['#DB2777', '#A78BFA', '#22D3EE'],
  ['#7C2D12', '#B45309', '#DC2626'],
  ['#0F766E', '#14B8A6', '#5EEAD4'],
  ['#9D174D', '#EC4899', '#FBBF24'],
  ['#1E3A8A', '#3B82F6', '#93C5FD'],
] as const;

type Props = {
  size: number;
  paletteIndex?: number;
  /** 0..1 live speech intensity. */
  intensity?: number;
  /** 0..1 spectrum bands for Siri-style bars inside the orb. */
  spectrum?: number[];
  active?: boolean;
};

function buildSoftSpectrum(paletteIndex: number, intensity: number, active: boolean, t: number): number[] {
  const seed = paletteIndex * 1.7;
  return Array.from({ length: SPECTRUM_BANDS }, (_, i) => {
    if (!active && intensity < 0.04) {
      return 0.08 + 0.04 * Math.sin(t * 1.2 + i * 0.4 + seed);
    }
    const wave =
      0.25 +
      0.35 * Math.sin(t * (1.8 + i * 0.15) + seed + i) +
      0.2 * Math.sin(t * 3.1 + i * 0.7);
    return Math.max(0.06, Math.min(1, wave * (0.35 + intensity * 0.65)));
  });
}

/**
 * Bright grainy voice orb with clipped Siri spectrum motion.
 */
export function VoiceOrb({
  size,
  paletteIndex = 0,
  intensity = 0,
  spectrum,
  active = false,
}: Props) {
  const reducedMotion = useReducedMotion();
  const pulse = React.useRef(new Animated.Value(0)).current;
  const ripple = React.useRef(new Animated.Value(0)).current;
  const colors = VOICE_ORB_PALETTES[paletteIndex % VOICE_ORB_PALETTES.length];
  const clamped = Math.max(0, Math.min(1, intensity));
  const intensityBoost = 1 + clamped * (active ? 0.12 : 0.06);
  const rippleOpacity = 0.14 + clamped * 0.4;
  const hasLiveSpectrum = Boolean(spectrum && spectrum.length > 0 && spectrum.some((v) => v > 0.02));
  const [softBars, setSoftBars] = useState(() => buildSoftSpectrum(paletteIndex, clamped, active, 0));

  useEffect(() => {
    if (reducedMotion || hasLiveSpectrum) return;
    if (!active && clamped < 0.04) {
      setSoftBars(buildSoftSpectrum(paletteIndex, 0, false, 0));
      return;
    }
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      setSoftBars(buildSoftSpectrum(paletteIndex, clamped, active, t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, clamped, hasLiveSpectrum, paletteIndex, reducedMotion]);

  const bars = (() => {
    if (reducedMotion) {
      return Array.from({ length: SPECTRUM_BANDS }, () => (active ? 0.2 : 0.08));
    }
    if (hasLiveSpectrum && spectrum) {
      const out: number[] = [];
      for (let i = 0; i < SPECTRUM_BANDS; i += 1) {
        const v = spectrum[i % spectrum.length] ?? 0;
        const bias = 0.85 + 0.15 * Math.sin(paletteIndex * 1.3 + i * 0.5);
        out.push(Math.max(0.05, Math.min(1, v * bias * (0.35 + clamped * 0.9))));
      }
      return out;
    }
    return softBars;
  })();

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300 + paletteIndex * 40,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1300 + paletteIndex * 40,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [paletteIndex, pulse, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      ripple.setValue(clamped);
      return;
    }
    Animated.timing(ripple, {
      toValue: clamped,
      duration: 70,
      useNativeDriver: true,
    }).start();
  }, [clamped, reducedMotion, ripple]);

  const idleScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, active ? 1.045 : 1.02],
  });

  const barWidth = Math.max(3, Math.floor(size * 0.045));
  const barGap = Math.max(2, Math.floor(size * 0.018));
  const maxBarH = size * 0.52;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: intensityBoost }],
      }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size * (1.1 + clamped * 0.16),
            height: size * (1.1 + clamped * 0.16),
            borderRadius: size,
            borderColor: colors[1],
            opacity: rippleOpacity * 0.5,
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size * (1.2 + clamped * 0.2),
            height: size * (1.2 + clamped * 0.2),
            borderRadius: size,
            borderColor: colors[2],
            opacity: rippleOpacity * 0.32,
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
          },
        ]}
      />

      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: idleScale }],
          overflow: 'hidden',
          ...Platform.select({
            web: {
              backgroundImage: `radial-gradient(circle at 32% 28%, ${colors[2]} 0%, ${colors[1]} 38%, ${colors[0]} 100%)`,
              boxShadow: active
                ? `0 ${10 + clamped * 12}px ${24 + clamped * 18}px rgba(15, 23, 42, ${0.22 + clamped * 0.12})`
                : '0 6px 16px rgba(15, 23, 42, 0.14)',
            } as object,
            default: {
              backgroundColor: colors[1],
              borderWidth: 1,
              borderColor: colors[0],
            },
          }),
        }}>
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            opacity: 0.22 + clamped * 0.08,
            backgroundColor: colors[0],
            ...Platform.select({
              web: {
                backgroundImage:
                  'repeating-radial-gradient(circle at 20% 20%, rgba(255,255,255,0.14) 0 1px, transparent 1px 3px), repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 2px)',
              } as object,
              default: {},
            }),
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: size * 0.1,
            left: size * 0.16,
            width: size * 0.36,
            height: size * 0.22,
            borderRadius: size,
            backgroundColor: '#FFFFFF',
            opacity: 0.28 + clamped * 0.12,
          }}
        />

        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: barGap,
            paddingHorizontal: size * 0.16,
          }}>
          {bars.map((level, index) => {
            const h = Math.max(barWidth * 1.2, maxBarH * level);
            return (
              <View
                key={`bar-${index}`}
                style={{
                  width: barWidth,
                  height: h,
                  borderRadius: barWidth,
                  backgroundColor: index % 2 === 0 ? colors[2] : '#FFFFFF',
                  opacity: 0.35 + level * 0.55,
                  ...Platform.select({
                    web: {
                      boxShadow: `0 0 ${4 + level * 8}px ${colors[1]}`,
                    } as object,
                    default: {},
                  }),
                }}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
});
