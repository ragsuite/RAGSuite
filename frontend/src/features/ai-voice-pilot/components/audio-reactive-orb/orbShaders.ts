/** GLSL shaders for organic multi-color audio-reactive Three.js voice orb. */

export const ORB_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uRms;
uniform float uPeak;
uniform float uIdle;
uniform float uStateAmp;
uniform float uIntensity;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisplace;
varying vec3 vLocalN;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p){
  float f = 0.0;
  float a = 0.5;
  for(int i=0;i<5;i++){
    f += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}

void main(){
  vec3 n = normalize(normal);
  vLocalN = n;
  float t = uTime;

  float idleNoise = fbm(n * 1.4 + vec3(t * 0.16, t * 0.11, t * 0.08));
  float bassDisp = snoise(n * 1.05 + vec3(t * 0.32, 0.0, t * 0.18)) * uBass;
  float midDisp  = fbm(n * 2.55 + vec3(t * 0.5, t * 0.38, 0.0)) * uMid;
  float highDisp = snoise(n * 7.2 + vec3(t * 1.9)) * uHigh;
  float peakKick = uPeak * snoise(n * 2.2 + vec3(t * 2.8));

  float displace =
      idleNoise * (0.04 + uIdle * 0.05)
    + bassDisp * 0.22 * uStateAmp
    + midDisp  * 0.15 * uStateAmp
    + highDisp * 0.07 * uStateAmp
    + peakKick * 0.12 * uStateAmp
    + uRms * 0.055 * uStateAmp;

  displace *= (0.55 + uIntensity * 0.75);

  vec3 pos = position + n * displace;
  vDisplace = displace;
  vNormal = normalize(normalMatrix * n);
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Organic multi-color surface: FBM patches + fresnel lighting.
 * Matches the premium AI-voice orb (cyan/blue body + coral/red flows).
 */
export const ORB_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uRms;
uniform float uIntensity;
uniform float uStateAmp;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
uniform vec3 uColorE;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisplace;
varying vec3 vLocalN;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p){
  float f = 0.0;
  float a = 0.5;
  for(int i=0;i<4;i++){
    f += a * snoise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return f;
}

void main(){
  vec3 n = normalize(vNormal);
  vec3 ln = normalize(vLocalN);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 2.2);

  float t = uTime * 0.2;
  float drift = uRms * 0.25 + uStateAmp * 0.1;

  // Soft organic domains (wide smoothsteps — blended patches, not speckles).
  float n1 = 0.5 + 0.5 * fbm(ln * 1.35 + vec3(t * 0.4, t * 0.25, -t * 0.3) + drift);
  float n2 = 0.5 + 0.5 * fbm(ln * 2.1 + vec3(-t * 0.35, t * 0.55, t * 0.2));
  float n3 = 0.5 + 0.5 * snoise(ln * 2.8 + vec3(t * 0.7));

  float wCoral = smoothstep(0.35, 0.72, n1);
  float wMid   = smoothstep(0.28, 0.68, n2);
  float wAccent = smoothstep(0.4, 0.78, n3 + vDisplace * 1.8);

  // Body = A→B, organic coral/red flows = C/D, rim highlight = E.
  vec3 base = mix(uColorA, uColorB, clamp(ln.y * 0.35 + 0.5, 0.0, 1.0));
  base = mix(base, uColorC, wCoral * 0.72);
  base = mix(base, uColorD, wMid * 0.45);
  base = mix(base, uColorC, wAccent * 0.28);
  base = mix(base, uColorE, fresnel * 0.4);

  float hemi = 0.65 + 0.35 * max(ln.y * 0.5 + 0.5, 0.0);
  base *= hemi;

  float glow = fresnel * (0.35 + uStateAmp * 0.45 + uRms * 0.35);
  vec3 col = base + uColorE * glow * 0.5;
  col += vec3(glow) * 0.08;

  float alpha = 0.95 + fresnel * 0.05;
  gl_FragColor = vec4(col, alpha);
}
`;

export type OrbColorTheme = 'purple' | 'pink' | 'blue' | 'orange' | 'red' | 'cyan';

/**
 * Multi-stop palettes with organic contrast inside ONE sphere.
 * Cyan matches the target Pilot look: blue/cyan body + coral/red patches.
 * A/B = body, C/D = organic patches, E = rim/highlight.
 */
export const ORB_THEME_COLORS: Record<OrbColorTheme, [string, string, string, string, string]> = {
  purple: ['#4C1D95', '#7C3AED', '#EC4899', '#F472B6', '#F5F3FF'],
  pink: ['#9D174D', '#DB2777', '#38BDF8', '#A78BFA', '#FDF2F8'],
  blue: ['#1E3A8A', '#3B82F6', '#F472B6', '#FB923C', '#EFF6FF'],
  orange: ['#9A3412', '#EA580C', '#EC4899', '#A855F7', '#FFF7ED'],
  red: ['#991B1B', '#EF4444', '#F97316', '#22D3EE', '#FEF2F2'],
  cyan: ['#0E7490', '#22D3EE', '#F97316', '#EF4444', '#ECFEFF'],
};

export const ORB_THEMES: OrbColorTheme[] = ['purple', 'pink', 'blue', 'orange', 'red', 'cyan'];

export function themeFromPaletteIndex(index: number): OrbColorTheme {
  return ORB_THEMES[((index % ORB_THEMES.length) + ORB_THEMES.length) % ORB_THEMES.length];
}

export type OrbVisualState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function stateUniforms(state: OrbVisualState): { idle: number; stateAmp: number } {
  switch (state) {
    case 'listening':
      return { idle: 0.7, stateAmp: 0.55 };
    case 'thinking':
      return { idle: 0.85, stateAmp: 0.45 };
    case 'speaking':
      return { idle: 0.35, stateAmp: 1.0 };
    default:
      return { idle: 1.0, stateAmp: 0.22 };
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
