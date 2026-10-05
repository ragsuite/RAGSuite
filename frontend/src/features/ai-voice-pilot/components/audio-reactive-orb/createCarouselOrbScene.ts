import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  ORB_FRAGMENT_SHADER,
  ORB_THEME_COLORS,
  ORB_VERTEX_SHADER,
  hexToRgb,
  stateUniforms,
  themeFromPaletteIndex,
  type OrbColorTheme,
  type OrbVisualState,
} from './orbShaders';

export type CarouselOrbSlot = {
  voiceId: string;
  paletteIndex: number;
};

export type CarouselOrbSceneHandle = {
  setSize: (width: number, height: number) => void;
  setSlots: (slots: CarouselOrbSlot[]) => void;
  setActiveIndex: (index: number, animate?: boolean) => void;
  setActiveBands: (bands: VoiceAudioBands) => void;
  setActiveState: (state: OrbVisualState) => void;
  setActiveIntensity: (value: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

type CreateOpts = {
  canvas: HTMLCanvasElement;
  visibleSlots: number;
  segments?: number;
};

type SmoothState = {
  bass: number;
  mid: number;
  high: number;
  rms: number;
  peak: number;
  idle: number;
  stateAmp: number;
  intensity: number;
  scale: number;
  opacity: number;
};

function scaleForDistance(distance: number): number {
  if (distance === 0) return 1;
  if (distance === 1) return 0.76;
  return 0.52;
}

function opacityForDistance(distance: number): number {
  if (distance === 0) return 1;
  if (distance === 1) return 0.68;
  return 0.35;
}

type MeshBundle = {
  group: InstanceType<typeof import('three').Group>;
  glowMat: InstanceType<typeof import('three').MeshBasicMaterial>;
  material: InstanceType<typeof import('three').ShaderMaterial>;
  uniforms: {
    uTime: { value: number };
    uBass: { value: number };
    uMid: { value: number };
    uHigh: { value: number };
    uRms: { value: number };
    uPeak: { value: number };
    uIdle: { value: number };
    uStateAmp: { value: number };
    uIntensity: { value: number };
    uColorA: { value: InstanceType<typeof import('three').Vector3> };
    uColorB: { value: InstanceType<typeof import('three').Vector3> };
    uColorC: { value: InstanceType<typeof import('three').Vector3> };
    uColorD: { value: InstanceType<typeof import('three').Vector3> };
    uColorE: { value: InstanceType<typeof import('three').Vector3> };
  };
  smooth: SmoothState;
  target: SmoothState;
  slotIndex: number;
};

const neighborIdle: VoiceAudioBands = { bass: 0.04, mid: 0.05, high: 0.04, rms: 0.05, peak: 0 };
const listenIdle: VoiceAudioBands = { bass: 0.06, mid: 0.08, high: 0.05, rms: 0.07, peak: 0 };

function applyTheme(
  uniforms: MeshBundle['uniforms'],
  glowMat: MeshBundle['glowMat'],
  themeName: OrbColorTheme,
) {
  const colors = ORB_THEME_COLORS[themeName];
  uniforms.uColorA.value.set(...hexToRgb(colors[0]));
  uniforms.uColorB.value.set(...hexToRgb(colors[1]));
  uniforms.uColorC.value.set(...hexToRgb(colors[2]));
  uniforms.uColorD.value.set(...hexToRgb(colors[3]));
  uniforms.uColorE.value.set(...hexToRgb(colors[4]));
  glowMat.color.set(colors[2]);
}

/**
 * Single WebGL context for Voices carousel.
 * One mesh per voice stays fixed at index * spacing; root.position.x eases
 * to -activeIndex * spacing — smooth slide, no remount/remap on select.
 */
export async function createCarouselOrbScene(opts: CreateOpts): Promise<CarouselOrbSceneHandle> {
  const THREE = await import('three');
  const visibleSlots = Math.max(3, opts.visibleSlots);
  const segments = opts.segments ?? 64;
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

  // World units: one slot = 2.4 → sphere radius 1 fills most of a taller slot.
  const spacing = 2.4;
  const halfH = 1.28;

  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    (-visibleSlots * spacing) / 2,
    (visibleSlots * spacing) / 2,
    halfH,
    -halfH,
    0.1,
    100,
  );
  camera.position.z = 5;

  const root = new THREE.Group();
  scene.add(root);

  const sharedGeo = new THREE.SphereGeometry(1, segments, segments);
  const glowGeo = new THREE.SphereGeometry(
    1.06,
    Math.max(20, Math.floor(segments / 2)),
    Math.max(20, Math.floor(segments / 2)),
  );

  const bundles: MeshBundle[] = [];
  let activeIndex = 0;
  let groupTargetX = 0;
  let groupX = 0;
  let slideFromX = 0;
  let slideStartMs = 0;
  let sliding = false;
  const SLIDE_MS = 580;
  let raf = 0;
  let running = false;
  let startedAt = performance.now();
  let activeBands: VoiceAudioBands = listenIdle;
  let activeState: OrbVisualState = 'listening';
  let activeIntensity = 0.5;

  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

  const makeBundle = (slotIndex: number, paletteIndex: number): MeshBundle => {
    const themeName = themeFromPaletteIndex(paletteIndex);
    const colors = ORB_THEME_COLORS[themeName];
    const rgb = colors.map(hexToRgb);
    const uniforms = {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uRms: { value: 0 },
      uPeak: { value: 0 },
      uIdle: { value: 1 },
      uStateAmp: { value: 0.22 },
      uIntensity: { value: 0.32 },
      uColorA: { value: new THREE.Vector3(...rgb[0]) },
      uColorB: { value: new THREE.Vector3(...rgb[1]) },
      uColorC: { value: new THREE.Vector3(...rgb[2]) },
      uColorD: { value: new THREE.Vector3(...rgb[3]) },
      uColorE: { value: new THREE.Vector3(...rgb[4]) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: ORB_VERTEX_SHADER,
      fragmentShader: ORB_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(sharedGeo, material);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors[2]),
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    const group = new THREE.Group();
    group.add(sphere);
    group.add(glow);
    group.position.x = slotIndex * spacing;
    root.add(group);

    const smooth: SmoothState = {
      bass: 0,
      mid: 0,
      high: 0,
      rms: 0,
      peak: 0,
      idle: 1,
      stateAmp: 0.22,
      intensity: 0.32,
      scale: 0.55,
      opacity: 0.35,
    };
    return {
      group,
      glowMat,
      material,
      uniforms,
      smooth,
      target: { ...smooth },
      slotIndex,
    };
  };

  const updateTargets = () => {
    for (const bundle of bundles) {
      const distance = Math.abs(bundle.slotIndex - activeIndex);
      // Cull far orbs for fill-rate; keep a small buffer beyond visible window.
      const inRange = distance <= Math.floor(visibleSlots / 2) + 1;
      bundle.group.visible = inRange;
      if (!inRange) continue;

      bundle.target.scale = scaleForDistance(distance);
      bundle.target.opacity = opacityForDistance(distance);

      if (distance === 0) {
        const u = stateUniforms(activeState);
        bundle.target.bass = activeBands.bass;
        bundle.target.mid = activeBands.mid;
        bundle.target.high = activeBands.high;
        bundle.target.rms = activeBands.rms;
        bundle.target.peak = activeBands.peak;
        bundle.target.idle = u.idle;
        bundle.target.stateAmp = u.stateAmp;
        bundle.target.intensity = activeIntensity;
      } else {
        bundle.target.bass = neighborIdle.bass;
        bundle.target.mid = neighborIdle.mid;
        bundle.target.high = neighborIdle.high;
        bundle.target.rms = neighborIdle.rms;
        bundle.target.peak = 0;
        const u = stateUniforms('idle');
        bundle.target.idle = u.idle;
        bundle.target.stateAmp = u.stateAmp;
        bundle.target.intensity = 0.28;
      }
    }
    groupTargetX = -activeIndex * spacing;
  };

  const resize = (w: number, h: number) => {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    renderer.setSize(width, height, false);
    const halfW = (visibleSlots * spacing) / 2;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  };

  const tick = () => {
    if (!running) return;
    const t = (performance.now() - startedAt) / 1000;

    if (sliding) {
      const elapsed = performance.now() - slideStartMs;
      const u = Math.min(1, elapsed / SLIDE_MS);
      const e = easeOutCubic(u);
      groupX = slideFromX + (groupTargetX - slideFromX) * e;
      if (u >= 1) {
        groupX = groupTargetX;
        sliding = false;
      }
    } else {
      groupX = groupTargetX;
    }
    root.position.x = groupX;

    const lerp = 0.14;
    const scaleLerp = 0.12;
    for (const bundle of bundles) {
      if (!bundle.group.visible) continue;
      bundle.uniforms.uTime.value = t;
      bundle.smooth.bass += (bundle.target.bass - bundle.smooth.bass) * lerp;
      bundle.smooth.mid += (bundle.target.mid - bundle.smooth.mid) * lerp;
      bundle.smooth.high += (bundle.target.high - bundle.smooth.high) * lerp;
      bundle.smooth.rms += (bundle.target.rms - bundle.smooth.rms) * lerp;
      bundle.smooth.peak += (bundle.target.peak - bundle.smooth.peak) * lerp;
      bundle.smooth.idle += (bundle.target.idle - bundle.smooth.idle) * lerp;
      bundle.smooth.stateAmp += (bundle.target.stateAmp - bundle.smooth.stateAmp) * lerp;
      bundle.smooth.intensity += (bundle.target.intensity - bundle.smooth.intensity) * lerp;
      bundle.smooth.scale += (bundle.target.scale - bundle.smooth.scale) * scaleLerp;
      bundle.smooth.opacity += (bundle.target.opacity - bundle.smooth.opacity) * scaleLerp;

      bundle.uniforms.uBass.value = bundle.smooth.bass;
      bundle.uniforms.uMid.value = bundle.smooth.mid;
      bundle.uniforms.uHigh.value = bundle.smooth.high;
      bundle.uniforms.uRms.value = bundle.smooth.rms;
      bundle.uniforms.uPeak.value = bundle.smooth.peak;
      bundle.uniforms.uIdle.value = bundle.smooth.idle;
      bundle.uniforms.uStateAmp.value = bundle.smooth.stateAmp;
      bundle.uniforms.uIntensity.value = bundle.smooth.intensity;

      const pulse = 1 + Math.min(0.025, bundle.smooth.rms * 0.028 * bundle.smooth.stateAmp);
      bundle.group.scale.setScalar(bundle.smooth.scale * pulse);
      const glowBase = 0.07 + bundle.smooth.rms * 0.1 * bundle.smooth.stateAmp;
      bundle.glowMat.opacity = glowBase * bundle.smooth.opacity;
      bundle.material.opacity = bundle.smooth.opacity;
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  return {
    setSize: resize,
    setSlots: (slots) => {
      // Rebuild only when voice list identity/length changes.
      while (bundles.length > slots.length) {
        const b = bundles.pop()!;
        root.remove(b.group);
        b.material.dispose();
        b.glowMat.dispose();
      }
      for (let i = 0; i < slots.length; i += 1) {
        const palette = slots[i].paletteIndex;
        if (i < bundles.length) {
          const b = bundles[i];
          b.slotIndex = i;
          b.group.position.x = i * spacing;
          applyTheme(b.uniforms, b.glowMat, themeFromPaletteIndex(palette));
        } else {
          bundles.push(makeBundle(i, palette));
        }
      }
      updateTargets();
    },
    setActiveIndex: (index, animate = true) => {
      activeIndex = Math.min(Math.max(index, 0), Math.max(bundles.length - 1, 0));
      updateTargets();
      if (!animate) {
        groupX = groupTargetX;
        sliding = false;
        root.position.x = groupX;
      } else if (Math.abs(groupX - groupTargetX) > 0.0001) {
        // Restart ease from current visual position (handles rapid chevron taps).
        slideFromX = groupX;
        slideStartMs = performance.now();
        sliding = true;
      }
    },
    setActiveBands: (bands) => {
      activeBands = bands;
      updateTargets();
    },
    setActiveState: (state) => {
      activeState = state;
      updateTargets();
    },
    setActiveIntensity: (value) => {
      activeIntensity = Math.max(0, Math.min(1, value));
      updateTargets();
    },
    start: () => {
      if (running) return;
      running = true;
      startedAt = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop: () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    dispose: () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      for (const b of bundles) {
        b.material.dispose();
        b.glowMat.dispose();
      }
      bundles.length = 0;
      sharedGeo.dispose();
      glowGeo.dispose();
      renderer.dispose();
      try {
        const gl = renderer.getContext();
        const lose = (
          gl as WebGLRenderingContext & {
            getExtension: (name: string) => { loseContext?: () => void } | null;
          }
        ).getExtension('WEBGL_lose_context');
        lose?.loseContext?.();
      } catch {
        /* ignore */
      }
    },
  };
}
