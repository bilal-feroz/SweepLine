import * as THREE from 'three';
import { bearingToWorld } from '../../config/site';

/** Sun direction: morning sun from the east, ~38° elevation (reference daylight). */
function sunDirection(): THREE.Vector3 {
  const h = bearingToWorld(100);
  const el = (38 * Math.PI) / 180;
  return new THREE.Vector3(h.x * Math.cos(el), Math.sin(el), h.z * Math.cos(el)).normalize();
}

/**
 * Uniforms shared by every scene material. Objects are shared by reference so a
 * single update (time, flow-view dimming, sea state) reaches all shaders.
 */
export const SHARED = {
  uTime: { value: 0 },
  uSunDir: { value: sunDirection() },
  uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
  /** Per-channel extinction of Gulf seawater (1/m) — red is absorbed fastest. */
  uWaterExtinction: { value: new THREE.Vector3(0.3, 0.085, 0.068) },
  /** In-scattered water colour (linear). */
  uWaterScatter: { value: new THREE.Color(0.006, 0.088, 0.118) },
  uHazeColor: { value: new THREE.Color(0.45, 0.63, 0.8) },
  uHazeDensity: { value: 0.00046 },
  uCaustics: { value: 0.85 },
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
  float h = 1.0 - exp(-uHazeDensity * above);
  col = mix(col, uHazeColor, h);
  return col * (1.0 - 0.38 * uFlowDim);
}
`;

/** Tileable animated caustic pattern (period 1 in p). */
export const CAUSTIC_GLSL = /* glsl */ `
uniform float uCaustics;
uniform float uTime;
float slCaustic(vec2 p) {
  float t = uTime * 0.42 + 23.0;
  vec2 q = mod(p * 6.28318, 6.28318) - 250.0;
  vec2 i = q;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / 0.005), q.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
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
            ? `if (vSlWorld.y < 0.0) {
            vec3 slUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            float slUpness = clamp(dot(normal, slUp) * 0.8 + 0.2, 0.0, 1.0);
            float slC = slCaustic(vSlWorld.xz / 7.5) + 0.5 * slCaustic(vSlWorld.xz / 3.1 + 0.37);
            outgoingLight += diffuseColor.rgb * uSunColor * slC * uCaustics * slUpness * exp(-max(-vSlWorld.y, 0.0) * 0.11);
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
