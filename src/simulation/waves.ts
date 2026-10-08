/**
 * Shared sea-state model.
 *
 * A small sum of sinusoidal components scaled by significant wave height. The
 * same constants drive the water-surface vertex shader, the curtain float
 * bobbing and the relative skirt heave used by the agent model, so what you
 * see and what the simulation uses always agree.
 */
const G = 9.81;

interface WaveComponent {
  /** Propagation direction in the world x/z plane (degrees from +x toward +z). */
  dirDeg: number;
  wavelength: number;
  /** Fraction of Hs/2 carried by this component. */
  amp: number;
  phase: number;
}

/** Waves propagate broadly onshore (toward −z) with some directional spread. */
export const WAVE_COMPONENTS: readonly WaveComponent[] = [
  { dirDeg: -100, wavelength: 38, amp: 0.44, phase: 0.0 },
  { dirDeg: -74, wavelength: 23, amp: 0.27, phase: 1.7 },
  { dirDeg: -122, wavelength: 14.5, amp: 0.17, phase: 4.1 },
  { dirDeg: -88, wavelength: 8.6, amp: 0.12, phase: 2.6 },
];

const COMPONENTS = WAVE_COMPONENTS.map((w) => {
  const a = (w.dirDeg * Math.PI) / 180;
  const k = (2 * Math.PI) / w.wavelength;
  return { dx: Math.cos(a) * k, dz: Math.sin(a) * k, omega: Math.sqrt(G * k), amp: w.amp, phase: w.phase };
});

/** Free-surface elevation (m) at a point for significant wave height `hs` at time `t` (s). */
export function waveElevation(x: number, z: number, t: number, hs: number): number {
  const a = hs * 0.5;
  let e = 0;
  for (let i = 0; i < COMPONENTS.length; i++) {
    const c = COMPONENTS[i];
    e += c.amp * Math.sin(c.dx * x + c.dz * z - c.omega * t + c.phase);
  }
  return e * a;
}

/** Sea-state uniforms, declared once per shader whichever wave chunk comes first. */
const WAVE_UNIFORMS_GLSL = /* glsl */ `
#ifndef SL_WAVE_UNIFORMS
#define SL_WAVE_UNIFORMS
uniform float uWaveAmp;   // Hs / 2
uniform float uWaveTime;
#endif
`;

/**
 * GLSL second derivatives of the same surface (hxx, hxz, hzz) — the curvature that focuses
 * sunlight into caustics.
 */
export const WAVES_HESSIAN_GLSL = /* glsl */ `
${WAVE_UNIFORMS_GLSL}
vec3 slSwellHessian(vec2 p) {
  vec3 h = vec3(0.0);
${COMPONENTS.map(
  (c) => `  {
    vec2 k = vec2(${c.dx.toFixed(6)}, ${c.dz.toFixed(6)});
    float ph = dot(k, p) - ${c.omega.toFixed(6)} * uWaveTime + ${c.phase.toFixed(4)};
    h -= ${c.amp.toFixed(4)} * sin(ph) * vec3(k.x * k.x, k.x * k.y, k.y * k.y);
  }`,
).join('\n')}
  return h * uWaveAmp;
}
`;

/** GLSL implementation (elevation + analytic slope) generated from the same constants. */
export const WAVES_GLSL = /* glsl */ `
${WAVE_UNIFORMS_GLSL}
float waveElevation(vec2 p, out vec2 slope) {
  float e = 0.0;
  slope = vec2(0.0);
${COMPONENTS.map(
  (c) => `  {
    vec2 k = vec2(${c.dx.toFixed(6)}, ${c.dz.toFixed(6)});
    float ph = dot(k, p) - ${c.omega.toFixed(6)} * uWaveTime + ${c.phase.toFixed(4)};
    e += ${c.amp.toFixed(4)} * sin(ph);
    slope += ${c.amp.toFixed(4)} * cos(ph) * k;
  }`,
).join('\n')}
  slope *= uWaveAmp;
  return e * uWaveAmp;
}
`;
