import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AudioReactiveOrb,
  type OrbColorTheme,
  type OrbVisualState,
} from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { ORB_THEMES } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const STATES: OrbVisualState[] = ['idle', 'listening', 'thinking', 'speaking'];

/**
 * Settings demo lab for the Three.js audio-reactive orb (web).
 * Mic/sim are independent of Pilot session playback.
 */
export function OrbLabPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [state, setState] = useState<OrbVisualState>('idle');
  const [theme, setTheme] = useState<OrbColorTheme>('cyan');
  const [intensity, setIntensity] = useState(0.55);
  const [simulate, setSimulate] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const stopMic = useCallback(() => {
    micStream?.getTracks().forEach((track) => track.stop());
    setMicStream(null);
  }, [micStream]);

  useEffect(() => () => stopMic(), [stopMic]);

  const startMic = async () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
      setMicError(t('voicePilot.orbLab.micWebOnly'));
      return;
    }
    setMicError(null);
    setSimulate(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setState('listening');
    } catch (err) {
      setMicError(err instanceof Error ? err.message : t('voicePilot.orbLab.micFailed'));
    }
  };

  const toggleSim = () => {
    stopMic();
    setSimulate((prev) => {
      const next = !prev;
      if (next) setState('speaking');
      return next;
    });
  };

  return (
    <View style={{ gap: spacing.md, alignItems: 'center' }}>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
        {t('voicePilot.orbLab.helper')}
      </Text>

      <View
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.lg,
          backgroundColor: '#0F172A',
          borderRadius: surfaceRadius.card,
          minHeight: 220,
        }}>
        <AudioReactiveOrb
          size={180}
          state={state}
          colorTheme={theme}
          intensity={intensity}
          simulate={simulate && !micStream}
          mediaStream={micStream}
          quality="high"
        />
      </View>

      {micError ? (
        <Text style={[typography.caption, { color: colors.danger }]}>{micError}</Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' }}>
        {STATES.map((s) => (
          <Pressable
            key={s}
            onPress={() => setState(s)}
            style={[
              styles.chip,
              {
                borderColor: state === s ? colors.primary : colors.border,
                backgroundColor: state === s ? colors.primaryTint : colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>
              {t(`voicePilot.orbLab.state.${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' }}>
        {ORB_THEMES.map((th) => (
          <Pressable
            key={th}
            onPress={() => setTheme(th)}
            style={[
              styles.chip,
              {
                borderColor: theme === th ? colors.primary : colors.border,
                backgroundColor: theme === th ? colors.primaryTint : colors.surface,
                borderRadius: surfaceRadius.button,
              },
            ]}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>{th}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ width: '100%', gap: spacing.xxs }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('voicePilot.orbLab.intensity')}: {Math.round(intensity * 100)}%
        </Text>
        {Platform.OS === 'web' ? (
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(intensity * 100)}
            onChange={(e: { target: { value: string } }) =>
              setIntensity(Number(e.target.value) / 100)
            }
            style={{ width: '100%' }}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' }}>
        <AppButton
          label={micStream ? t('voicePilot.orbLab.stopMic') : t('voicePilot.orbLab.startMic')}
          variant="secondary"
          onPress={() => (micStream ? stopMic() : void startMic())}
        />
        <AppButton
          label={simulate ? t('voicePilot.orbLab.stopDemo') : t('voicePilot.orbLab.startDemo')}
          variant="secondary"
          onPress={toggleSim}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
