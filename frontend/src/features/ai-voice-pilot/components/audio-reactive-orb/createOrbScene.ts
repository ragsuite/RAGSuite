import type { VoiceAudioBands } from '@/features/ai-voice-pilot/utils/voice-audio-session';
import {
  ORB_FRAGMENT_SHADER,
  ORB_THEME_COLORS,
  ORB_VERTEX_SHADER,
  hexToRgb,
  stateUniforms,
  type OrbColorTheme,
  type OrbVisualState,
} from './orbShaders';

export type OrbSceneHandle = {
  setSize: (width: number, height: number) => void;
  setBands: (bands: VoiceAudioBands) => void;
  setState: (state: OrbVisualState) => void;
  setTheme: (theme: OrbColorTheme) => void;
  setIntensity: (value: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

type CreateOpts = {
  canvas: HTMLCanvasElement;
  segments?: number;
  dpr?: number;
};

/**
 * Creates a Three.js fluid orb scene mounted on an existing canvas.
 * Dynamic-imports `three` so native bundles do not hard-fail.
 */
export async function createOrbScene(opts: CreateOpts): Promise<OrbSceneHandle> {
  const THREE = await import('three');
  const segments = opts.segments ?? 80;
  const dpr = Math.min(opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), 2);

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
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.z = 3.35;

  const theme = ORB_THEME_COLORS.cyan;
  const rgb = theme.map(hexToRgb) as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];

  const uniforms = {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uRms: { value: 0 },
    uPeak: { value: 0 },
    uIdle: { value: 1 },
    uStateAmp: { value: 0.22 },
    uIntensity: { value: 0.35 },
    uColorA: { value: new THREE.Vector3(...rgb[0]) },
    uColorB: { value: new THREE.Vector3(...rgb[1]) },
    uColorC: { value: new THREE.Vector3(...rgb[2]) },
    uColorD: { value: new THREE.Vector3(...rgb[3]) },
    uColorE: { value: new THREE.Vector3(...rgb[4]) },
  };

  const geometry = new THREE.SphereGeometry(1, segments, segments);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ORB_VERTEX_SHADER,
    fragmentShader: ORB_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const glowGeo = new THREE.SphereGeometry(
    1.06,
    Math.max(24, Math.floor(segments / 2)),
    Math.max(24, Math.floor(segments / 2)),
  );
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme[2]),
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  scene.add(glow);

  let raf = 0;
  let running = false;
  const smooth = {
    bass: 0,
    mid: 0,
    high: 0,
    rms: 0,
    peak: 0,
    idle: 1,
    stateAmp: 0.22,
    intensity: 0.35,
  };
  const target = { ...smooth };
  let startedAt = performance.now();

  const resize = (w: number, h: number) => {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const tick = () => {
    if (!running) return;
    const t = (performance.now() - startedAt) / 1000;
    uniforms.uTime.value = t;

    const lerp = 0.14;
    smooth.bass += (target.bass - smooth.bass) * lerp;
    smooth.mid += (target.mid - smooth.mid) * lerp;
    smooth.high += (target.high - smooth.high) * lerp;
    smooth.rms += (target.rms - smooth.rms) * lerp;
    smooth.peak += (target.peak - smooth.peak) * lerp;
    smooth.idle += (target.idle - smooth.idle) * lerp;
    smooth.stateAmp += (target.stateAmp - smooth.stateAmp) * lerp;
    smooth.intensity += (target.intensity - smooth.intensity) * lerp;

    uniforms.uBass.value = smooth.bass;
    uniforms.uMid.value = smooth.mid;
    uniforms.uHigh.value = smooth.high;
    uniforms.uRms.value = smooth.rms;
    uniforms.uPeak.value = smooth.peak;
    uniforms.uIdle.value = smooth.idle;
    uniforms.uStateAmp.value = smooth.stateAmp;
    uniforms.uIntensity.value = smooth.intensity;

    const scale = 1 + Math.min(0.028, smooth.rms * 0.03 * smooth.stateAmp);
    mesh.scale.setScalar(scale);
    glow.scale.setScalar(1.02 + smooth.rms * 0.02);
    glowMat.opacity = 0.08 + smooth.rms * 0.12 * smooth.stateAmp;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  return {
    setSize: resize,
    setBands: (bands) => {
      target.bass = bands.bass;
      target.mid = bands.mid;
      target.high = bands.high;
      target.rms = bands.rms;
      target.peak = bands.peak;
    },
    setState: (state) => {
      const u = stateUniforms(state);
      target.idle = u.idle;
      target.stateAmp = u.stateAmp;
    },
    setTheme: (themeName) => {
      const colors = ORB_THEME_COLORS[themeName];
      uniforms.uColorA.value.set(...hexToRgb(colors[0]));
      uniforms.uColorB.value.set(...hexToRgb(colors[1]));
      uniforms.uColorC.value.set(...hexToRgb(colors[2]));
      uniforms.uColorD.value.set(...hexToRgb(colors[3]));
      uniforms.uColorE.value.set(...hexToRgb(colors[4]));
      glowMat.color.set(colors[2]);
    },
    setIntensity: (value) => {
      target.intensity = Math.max(0, Math.min(1, value));
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
      geometry.dispose();
      material.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      renderer.dispose();
      try {
        const gl = renderer.getContext();
        const lose = (gl as WebGLRenderingContext & {
          getExtension: (name: string) => { loseContext?: () => void } | null;
        }).getExtension('WEBGL_lose_context');
        lose?.loseContext?.();
      } catch {
        /* ignore */
      }
    },
  };
}
