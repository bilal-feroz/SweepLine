import * as THREE from 'three';
import { bearingToWorld } from '../../config/site';
import { WAVES_HESSIAN_GLSL } from '../../simulation/waves';
import { makeWaterNormalMap } from './textures';

/** Sun direction: morning sun from the east, ~38° elevation (reference daylight). */
function sunDirection(): THREE.Vector3 {
  const h = bearingToWorld(100);
  const el = (38 * Math.PI) / 180;
  return new THREE.Vector3(h.x * Math.cos(el), Math.sin(el), h.z * Math.cos(el)).normalize();
}

/** Direction of sunlight after refraction into a calm surface (Snell, n = 1.333). */
function refractedSun(toSun: THREE.Vector3): THREE.Vector3 {
  const eta = 1 / 1.333;
  const cosi = toSun.y;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  const i = toSun.clone().negate();
  return i.multiplyScalar(eta).add(new THREE.Vector3(0, eta * cosi - Math.sqrt(k), 0)).normalize();
}

const SUN_DIR = sunDirection();

/**
 * Uniforms shared by every scene material. Objects are shared by reference so a
 * single update (time, flow-view dimming, sea state) reaches all shaders.
 */
export const SHARED = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR },
  /** Sunlight direction under the water surface (for caustics and light shafts). */
  uSunRefr: { value: refractedSun(SUN_DIR) },
  uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
  /** Per-channel extinction of Gulf seawater (1/m) — red is absorbed fastest. */
  uWaterExtinction: { value: new THREE.Vector3(0.3, 0.085, 0.068) },
  /** In-scattered water colour (linear). */
  uWaterScatter: { value: new THREE.Color(0.006, 0.088, 0.118) },
  uHazeColor: { value: new THREE.Color(0.45, 0.63, 0.8) },
  uHazeDensity: { value: 0.00046 },
  uCaustics: { value: 0.85 },
  /** How strongly surface curvature focuses the light (Snell's 1 − 1/n, plus artistic gain). */
  uCausticFocus: { value: 0.32 },
  /** The water's small-scale ripple normals — shared so caustics follow the visible surface. */
  uRippleMap: { value: makeWaterNormalMap(256) },
  /** 0..1 — Flow View darkens the environment so streamlines read clearly. */
  uFlowDim: { value: 0 },
  uWaveAmp: { value: 0.4 },
  uWaveTime: { value: 0 },
};

/** Physically motivated light transport through water and air for any world-space fragment. */
export const MEDIUM_GLSL = /* glsl */ `
uniform vec3 uWaterExtinction;
uniform vec3 uWaterScatter;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform float uFlowDim;
// Haze along an air path of length airDist from the camera to wp. The haze thins with height
// (scale height 250 m), so views along the coast stay hazy while views from overhead stay clear.
float slHaze(vec3 cam, vec3 wp, float airDist) {
  float ha = max(cam.y, 0.0);
  float hb = max(wp.y, 0.0);
  float dh = abs(ha - hb);
  float lo = min(ha, hb);
  float fall = dh > 0.5 ? 250.0 * (exp(-lo / 250.0) - exp(-(lo + dh) / 250.0)) / dh : exp(-lo / 250.0);
  return 1.0 - exp(-uHazeDensity * airDist * fall);
}
vec3 slMedium(vec3 col, vec3 wp) {
  vec3 cam = cameraPosition;
  float dist = length(wp - cam);
  float under = 0.0;
  float above = 0.0;
  if (cam.y >= 0.0) {
    if (wp.y < 0.0) {
      float f = cam.y / max(cam.y - wp.y, 1e-4);
      under = dist * (1.0 - f);
      above = dist * f;
    } else {
      above = dist;
    }
  } else {
    if (wp.y < 0.0) {
      under = dist;
    } else {
      float f = -cam.y / max(wp.y - cam.y, 1e-4);
      under = dist * f;
      above = dist * (1.0 - f);
    }
  }
  float dpt = max(-wp.y, 0.0);
  col *= exp(-uWaterExtinction * dpt * 0.55);
  if (under > 0.0) {
    vec3 T = exp(-uWaterExtinction * under);
    vec3 scat = uWaterScatter * (0.45 + 0.55 * exp(-dpt * 0.09));
    // Seen from inside the water column, side- and up-welling light is much brighter
    // than the down-welling light seen looking into the depths from above.
    if (cam.y < 0.0) scat *= 2.3 + 1.4 * clamp(normalize(wp - cam).y, -0.6, 1.0);
    col = col * T + scat * (1.0 - T);
  }
  col = mix(col, uHazeColor, slHaze(cam, wp, above));
  return col * (1.0 - 0.38 * uFlowDim);
}
`;

/**
 * Caustics from the live sea surface. Sunlight refracted through the surface converges under
 * crests curved one way and spreads under the others: at depth d the irradiance is
 * 1 / |det(I + a d grad(G))|, where G is the surface slope, grad(G) its curvature and a the
 * focusing gain. The swell's curvature is analytic (the same components as the water's vertex
 * waves); the ripples' comes from finite differences of the same scrolling normal maps the water
 * shades with, so the pattern moves with the surface you see. Each receiver looks up the surface
 * point its sunlight came through. The fine octave fades out once it is smaller than a pixel.
 */
export const CAUSTIC_GLSL = /* glsl */ `
#ifndef SL_CAUSTICS
#define SL_CAUSTICS
uniform float uCaustics;
uniform float uCausticFocus;
uniform vec3 uSunRefr;
uniform sampler2D uRippleMap;
#ifndef SL_TIME
#define SL_TIME
uniform float uTime;
#endif
${WAVES_HESSIAN_GLSL}
vec2 slRippleSlope(vec2 p, float fine) {
  vec2 n2 = texture2D(uRippleMap, p / 8.5 + vec2(-uTime * 0.021, uTime * 0.014)).xy * 2.0 - 1.0;
  vec2 n3 = texture2D(uRippleMap, p / 3.1 + vec2(uTime * 0.03, -uTime * 0.025)).xy * 2.0 - 1.0;
  return (n2 * 0.4 + n3 * (0.22 * fine)) * 0.46 * (0.55 + uWaveAmp * 0.9);
}
// Irradiance factor (1 = no focusing) at submerged point p; foot = pixel footprint in metres.
float slCaustic(vec3 p, float foot) {
  float d = max(-p.y, 0.0);
  vec2 xs = p.xz - uSunRefr.xz * (d / max(-uSunRefr.y, 0.2));
  float fine = 1.0 - smoothstep(0.02, 0.08, foot);
  float coarse = 1.0 - smoothstep(0.1, 0.4, foot);
  float e = 0.04 + 0.01 * d;
  vec2 g0 = slRippleSlope(xs, fine);
  vec2 gx = slRippleSlope(xs + vec2(e, 0.0), fine);
  vec2 gz = slRippleSlope(xs + vec2(0.0, e), fine);
  vec3 sw = slSwellHessian(xs);
  float k = uCausticFocus * d;
  float h11 = (gx.x - g0.x) / e + sw.x;
  float h12 = (gz.x - g0.x) / e + sw.y;
  float h21 = (gx.y - g0.y) / e + sw.y;
  float h22 = (gz.y - g0.y) / e + sw.z;
  float det = (1.0 + k * h11) * (1.0 + k * h22) - k * k * h12 * h21;
  float I = min(1.0 / max(abs(det), 0.16), 4.5);
  // Contrast builds over the first metre, softens with depth, and fades when sub-pixel.
  return 1.0 + (I - 1.0) * coarse * smoothstep(0.0, 1.0, d) * exp(-d * 0.045);
}
// Coarse focusing (swell + the 8.5 m ripple octave) for light shafts in the water column. The
// gain is raised well above the caustics' so the gentle swell still draws visible shafts.
float slShaftFocus(vec3 p) {
  float d = max(-p.y, 0.0);
  vec2 xs = p.xz - uSunRefr.xz * (d / max(-uSunRefr.y, 0.2));
  vec2 uv = xs / 8.5 + vec2(-uTime * 0.021, uTime * 0.014);
  float s = 0.4 * 0.46 * (0.55 + uWaveAmp * 0.9);
  float e = 0.2;
  vec2 g0 = (texture2D(uRippleMap, uv).xy * 2.0 - 1.0) * s;
  vec2 gx = (texture2D(uRippleMap, uv + vec2(e / 8.5, 0.0)).xy * 2.0 - 1.0) * s;
  vec2 gz = (texture2D(uRippleMap, uv + vec2(0.0, e / 8.5)).xy * 2.0 - 1.0) * s;
  vec3 sw = slSwellHessian(xs);
  float k = uCausticFocus * d * 5.0;
  float h11 = (gx.x - g0.x) / e + sw.x;
  float h12 = (gz.x - g0.x) / e + sw.y;
  float h21 = (gx.y - g0.y) / e + sw.y;
  float h22 = (gz.y - g0.y) / e + sw.z;
  float det = (1.0 + k * h11) * (1.0 + k * h22) - k * k * h12 * h21;
  // Softer than the caustics: sharp peaks would alias between the ray-march steps.
  return min(1.0 / max(abs(det), 0.4), 2.5);
}
#endif
`;

type StdMat = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

/**
 * Inject water/air light transport (and optional caustics) into a standard
 * PBR material. Works with instanced meshes.
 */
export function applyMedium<T extends StdMat>(
  mat: T,
  opts: { caustics?: boolean; key?: string; extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void } = {},
): T {
  const caustics = opts.caustics ?? true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterExtinction = SHARED.uWaterExtinction;
    shader.uniforms.uWaterScatter = SHARED.uWaterScatter;
    shader.uniforms.uHazeColor = SHARED.uHazeColor;
    shader.uniforms.uHazeDensity = SHARED.uHazeDensity;
    shader.uniforms.uFlowDim = SHARED.uFlowDim;
    shader.uniforms.uCaustics = SHARED.uCaustics;
    shader.uniforms.uCausticFocus = SHARED.uCausticFocus;
    shader.uniforms.uSunRefr = SHARED.uSunRefr;
    shader.uniforms.uRippleMap = SHARED.uRippleMap;
    shader.uniforms.uWaveAmp = SHARED.uWaveAmp;
    shader.uniforms.uWaveTime = SHARED.uWaveTime;
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uSunColor = SHARED.uSunColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 slWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          slWp = instanceMatrix * slWp;
        #endif
        vSlWorld = (modelMatrix * slWp).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSlWorld;\nuniform vec3 uSunColor;\n${MEDIUM_GLSL}\n${CAUSTIC_GLSL}`)
      .replace(
        '#include <opaque_fragment>',
        `${
          caustics
            ? `float slFoot = length(fwidth(vSlWorld.xz));
          if (vSlWorld.y < 0.0) {
            // Caustics redistribute the direct sunlight (already shadowed), so shade carves them out.
            outgoingLight += reflectedLight.directDiffuse * (slCaustic(vSlWorld, slFoot) - 1.0) * uCaustics;
          }`
            : ''
        }
        #include <opaque_fragment>
        gl_FragColor.rgb = slMedium(gl_FragColor.rgb, vSlWorld);`,
      );
    opts.extra?.(shader);
  };
  const key = `sl-medium${caustics ? '-c' : ''}${opts.key ? `-${opts.key}` : ''}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Convenience: standard material with medium injection. */
export function mediumMaterial(params: THREE.MeshStandardMaterialParameters, caustics = true): THREE.MeshStandardMaterial {
  return applyMedium(new THREE.MeshStandardMaterial(params), { caustics });
}
