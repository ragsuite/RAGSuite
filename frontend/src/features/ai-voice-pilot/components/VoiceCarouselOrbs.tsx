import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { VoicePilotVoice } from '@/features/ai-voice-pilot/types/voice-pilot.types';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import { spherePaletteIndex } from '@/features/ai-voice-pilot/utils/voice-trending';
import { AudioReactiveOrb } from '@/features/ai-voice-pilot/components/AudioReactiveOrb';
import { themeFromPaletteIndex } from '@/features/ai-voice-pilot/components/audio-reactive-orb/orbShaders';
import {
  createCarouselOrbScene,
  type CarouselOrbSceneHandle,
} from './audio-reactive-orb/createCarouselOrbScene';
import { preloadThree } from './audio-reactive-orb/orbWebGlPool';
import type { OrbVisualState } from './audio-reactive-orb/orbShaders';

type Props = {
  voices: VoicePilotVoice[];
  activeIndex: number;
  width: number;
  height: number;
  visibleSlots: number;
  playing: boolean;
  orbBands?: VoiceAudioBands;
  onPressActive: () => void;
  onPressNeighbor: (index: number) => void;
};

const listenBands: VoiceAudioBands = { bass: 0.06, mid: 0.08, high: 0.05, rms: 0.07, peak: 0 };

/**
 * One Three.js canvas for Voices — smooth group slide, Pilot-quality organic orbs.
 */
export function VoiceCarouselOrbs({
  voices,
  activeIndex,
  width,
  height,
  visibleSlots,
  playing,
  orbBands,
  onPressActive,
  onPressNeighbor,
}: Props) {
  const hostRef = useRef<View>(null);
  const sceneRef = useRef<CarouselOrbSceneHandle | null>(null);
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(voices.length - 1, 0));
  const itemW = width / visibleSlots;
  const half = Math.floor(visibleSlots / 2);

  const slots = useMemo(
    () =>
      voices.map((v) => ({
        voiceId: v.voice_id,
        paletteIndex: spherePaletteIndex(v.voice_id),
      })),
    [voices],
  );

  useEffect(() => {
    if (Platform.OS === 'web') void preloadThree();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const mount = async () => {
      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host || cancelled) return;

      for (let i = 0; i < 30; i += 1) {
        if (cancelled) return;
        if ((host.clientWidth || width) >= 8 && (host.clientHeight || height) >= 8) break;
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      }
      if (cancelled) return;

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      host.innerHTML = '';
      host.appendChild(canvas);

      try {
        const scene = await createCarouselOrbScene({
          canvas,
          visibleSlots,
          segments: 64,
        });
        if (cancelled) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        scene.setSize(host.clientWidth || width, host.clientHeight || height);
        scene.setSlots(slots);
        scene.setActiveIndex(safeIndex, false);
        scene.setActiveState(playing ? 'speaking' : 'listening');
        scene.setActiveIntensity(playing ? 0.9 : 0.5);
        scene.setActiveBands(playing && orbBands ? orbBands : listenBands);
        scene.start();

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || !sceneRef.current) return;
          const { width: w, height: h } = entry.contentRect;
          sceneRef.current.setSize(w || width, h || height);
        });
        resizeObserver.observe(host);
      } catch (err) {
        console.error('[VoiceCarouselOrbs] Three.js init failed', err);
        if (host) host.innerHTML = '';
        sceneRef.current = null;
      }
    };

    void mount();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      sceneRef.current?.stop();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      const host = hostRef.current as unknown as HTMLElement | null;
      if (host) host.innerHTML = '';
    };
    // Remount only when slot count changes — size via ResizeObserver; index via setActiveIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSlots]);

  useEffect(() => {
    sceneRef.current?.setSlots(slots);
  }, [slots]);

  useEffect(() => {
    sceneRef.current?.setActiveIndex(safeIndex, true);
  }, [safeIndex]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setSize(width, height);
  }, [width, height]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const state: OrbVisualState = playing ? 'speaking' : 'listening';
    scene.setActiveState(state);
    scene.setActiveIntensity(playing ? 0.9 : 0.5);
    scene.setActiveBands(playing && orbBands ? orbBands : listenBands);
  }, [orbBands, playing]);

  // Native: fall back to single active AudioReactiveOrb + scaled neighbors (no multi-canvas).
  if (Platform.OS !== 'web') {
    return (
      <View style={{ width, height, flexDirection: 'row', alignItems: 'center' }}>
        {Array.from({ length: visibleSlots }).map((_, i) => {
          const voiceIndex = safeIndex - half + i;
          const voice = voices[voiceIndex];
          if (!voice) return <View key={`n-${i}`} style={{ width: itemW }} />;
          const active = voiceIndex === safeIndex;
          const orbSize = Math.round(itemW * (active ? 0.85 : distanceScale(Math.abs(voiceIndex - safeIndex))));
          return (
            <Pressable
              key={voice.voice_id}
              onPress={() => (active ? onPressActive() : onPressNeighbor(voiceIndex))}
              style={{ width: itemW, alignItems: 'center', justifyContent: 'center' }}>
              <AudioReactiveOrb
                size={orbSize}
                colorTheme={themeFromPaletteIndex(spherePaletteIndex(voice.voice_id))}
                paletteIndex={spherePaletteIndex(voice.voice_id)}
                bands={active && playing ? orbBands : listenBands}
                state={active && playing ? 'speaking' : active ? 'listening' : 'idle'}
                quality={active ? 'high' : 'low'}
                priority={active ? 100 : 10}
                intensity={active && playing ? 0.9 : 0.35}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={{ width, height, position: 'relative' }}>
      <View
        ref={hostRef}
        style={[styles.host, { width, height }]}
        pointerEvents="none"
      />
      <View style={[styles.hitRow, { width, height }]} pointerEvents="box-none">
        {Array.from({ length: visibleSlots }).map((_, i) => {
          const voiceIndex = safeIndex - half + i;
          const active = voiceIndex === safeIndex;
          const valid = voiceIndex >= 0 && voiceIndex < voices.length;
          return (
            <Pressable
              key={`hit-${i}`}
              disabled={!valid}
              onPress={() => {
                if (!valid) return;
                if (active) onPressActive();
                else onPressNeighbor(voiceIndex);
              }}
              style={{ width: itemW, height }}
            />
          );
        })}
      </View>
    </View>
  );
}

function distanceScale(distance: number) {
  if (distance === 0) return 0.85;
  if (distance === 1) return 0.6;
  return 0.45;
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  hitRow: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
  },
});
