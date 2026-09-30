import React, { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { VoiceOrb } from '@/features/ai-voice-pilot/components/VoiceOrb';
import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { createOrbScene, type OrbSceneHandle } from './audio-reactive-orb/createOrbScene';
import {
  acquireOrbScene,
  bumpOrbPriority,
  preloadThree,
  releaseOrbScene,
} from './audio-reactive-orb/orbWebGlPool';
import {
  ORB_THEMES,
  themeFromPaletteIndex,
  type OrbColorTheme,
  type OrbVisualState,
} from './audio-reactive-orb/orbShaders';

export type { OrbColorTheme, OrbVisualState };

type Props = {
  size: number;
  state?: OrbVisualState;
  colorTheme?: OrbColorTheme;
  paletteIndex?: number;
  bands?: VoiceAudioBands;
  intensity?: number;
  quality?: 'high' | 'low';
  /** Higher = less likely to be evicted (Pilot / active carousel ≈ 100). */
  priority?: number;
  simulate?: boolean;
  audioElement?: HTMLAudioElement | null;
  mediaStream?: MediaStream | null;
};

const idleBands: VoiceAudioBands = { bass: 0, mid: 0, high: 0, rms: 0, peak: 0 };

/**
 * Shared Three.js organic voice orb (Pilot + Voices carousel).
 * Web: always WebGL (no silent CSS circle fallback).
 * Native / reduced-motion: VoiceOrb.
 */
export function AudioReactiveOrb({
  size,
  state = 'idle',
  colorTheme,
  paletteIndex = 0,
  bands,
  intensity = 0.35,
  quality = 'high',
  priority = 10,
  simulate = false,
  audioElement = null,
  mediaStream = null,
}: Props) {
  const reducedMotion = useReducedMotion();
  const reactId = useId();
  const [retryToken, setRetryToken] = useState(0);
  const useWebGl = Platform.OS === 'web' && !reducedMotion;
  const theme = colorTheme ?? themeFromPaletteIndex(paletteIndex);
  const hostRef = useRef<View>(null);
  const sceneRef = useRef<OrbSceneHandle | null>(null);
  const poolId = `orb-${reactId}`;
  const failCountRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') void preloadThree();
  }, []);

  useEffect(() => {
    bumpOrbPriority(poolId, priority);
  }, [poolId, priority]);

  useEffect(() => {
    if (!useWebGl) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const mount = async () => {
      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host || cancelled) return;

      for (let i = 0; i < 24; i += 1) {
        if (cancelled) return;
        if ((host.clientWidth || size) >= 8) break;
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      }
      if (cancelled) return;

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.borderRadius = '50%';
      host.innerHTML = '';
      host.appendChild(canvas);

      try {
        const scene = await acquireOrbScene(poolId, priority, async () => {
          return createOrbScene({
            canvas,
            segments: quality === 'high' ? 80 : 40,
            dpr: quality === 'high' ? undefined : 1,
          });
        });
        if (cancelled) {
          releaseOrbScene(poolId);
          return;
        }
        sceneRef.current = scene;
        failCountRef.current = 0;
        scene.setTheme(theme);
        scene.setState(state);
        scene.setIntensity(intensity);
        scene.setBands(bands ?? idleBands);
        scene.setSize(host.clientWidth || size, host.clientHeight || size);
        scene.start();

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || !sceneRef.current) return;
          const { width, height } = entry.contentRect;
          sceneRef.current.setSize(width || size, height || size);
        });
        resizeObserver.observe(host);
      } catch (err) {
        console.error('[AudioReactiveOrb] Three.js init failed', err);
        if (canvas.parentElement) canvas.parentElement.innerHTML = '';
        sceneRef.current = null;
        if (cancelled) return;
        failCountRef.current += 1;
        // Retry once — never swap to flat CSS VoiceOrb on web.
        if (failCountRef.current < 2) {
          setTimeout(() => {
            if (!cancelled) setRetryToken((n) => n + 1);
          }, 500);
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      sceneRef.current = null;
      releaseOrbScene(poolId);
      const host = hostRef.current as unknown as HTMLElement | null;
      if (host) host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, useWebGl, poolId, retryToken]);

  useEffect(() => {
    if (!useWebGl || !sceneRef.current) return;
    const host = hostRef.current as unknown as HTMLElement | null;
    sceneRef.current.setSize(host?.clientWidth || size, host?.clientHeight || size);
  }, [size, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    sceneRef.current?.setTheme(theme);
  }, [theme, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    sceneRef.current?.setState(state);
  }, [state, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    sceneRef.current?.setIntensity(intensity);
  }, [intensity, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    if (bands) sceneRef.current?.setBands(bands);
  }, [bands, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    if (!simulate && state === 'idle' && (!bands || bands.rms < 0.02)) {
      let raf = 0;
      const started = performance.now();
      const tick = () => {
        const t = (performance.now() - started) / 1000;
        sceneRef.current?.setBands({
          bass: 0.08 + 0.06 * Math.sin(t * 1.1),
          mid: 0.1 + 0.07 * Math.sin(t * 1.7 + 1),
          high: 0.06 + 0.05 * Math.sin(t * 2.4 + 2),
          rms: 0.08 + 0.05 * Math.sin(t * 1.3),
          peak: 0,
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    if (simulate) {
      let raf = 0;
      const started = performance.now();
      const tick = () => {
        const t = (performance.now() - started) / 1000;
        const amp = 0.35 + 0.35 * intensity;
        sceneRef.current?.setBands({
          bass: amp * (0.4 + 0.4 * Math.sin(t * 2.2)),
          mid: amp * (0.45 + 0.4 * Math.sin(t * 3.1 + 1)),
          high: amp * (0.35 + 0.4 * Math.sin(t * 5.2 + 2)),
          rms: amp * (0.5 + 0.3 * Math.sin(t * 2.8)),
          peak: Math.max(0, Math.sin(t * 4) - 0.7) * 2,
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [bands, intensity, simulate, state, useWebGl]);

  useEffect(() => {
    if (!useWebGl) return;
    if (!mediaStream && !audioElement) return;

    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let raf = 0;

    const run = async () => {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      await ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;

      try {
        if (mediaStream) {
          source = ctx.createMediaStreamSource(mediaStream);
          source.connect(analyser);
        } else if (audioElement) {
          const srcUrl = audioElement.currentSrc || audioElement.src || '';
          const isBlob = srcUrl.startsWith('blob:') || srcUrl.startsWith('data:');
          let sameOrigin = false;
          try {
            sameOrigin = new URL(srcUrl, window.location.href).origin === window.location.origin;
          } catch {
            sameOrigin = false;
          }
          if (!isBlob && !sameOrigin) return;
          source = ctx.createMediaElementSource(audioElement);
          source.connect(analyser);
          source.connect(ctx.destination);
        }
      } catch {
        return;
      }

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(data);
        const n = data.length;
        const avg = (from: number, to: number) => {
          let s = 0;
          const a = Math.floor(from);
          const b = Math.min(n, Math.ceil(to));
          for (let i = a; i < b; i += 1) s += data[i];
          return b > a ? Math.min(1, (s / ((b - a) * 255)) * 2.2) : 0;
        };
        let sum = 0;
        for (let i = 0; i < n; i += 1) sum += data[i];
        const rms = Math.min(1, (sum / (n * 255)) * 2.4);
        sceneRef.current?.setBands({
          bass: avg(0, n * 0.12),
          mid: avg(n * 0.12, n * 0.45),
          high: avg(n * 0.45, n),
          rms,
          peak: rms > 0.55 ? rms : 0,
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    void run();

    return () => {
      cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      void ctx?.close();
    };
  }, [audioElement, mediaStream, useWebGl]);

  // Native / reduced-motion only — never a web CSS pale circle.
  if (!useWebGl) {
    return (
      <VoiceOrb
        size={size}
        paletteIndex={ORB_THEMES.indexOf(theme)}
        intensity={bands?.rms ?? intensity}
        active={state !== 'idle'}
      />
    );
  }

  return (
    <View
      ref={hostRef}
      style={[styles.host, { width: size, height: size, borderRadius: size / 2 }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
