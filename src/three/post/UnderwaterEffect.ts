import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CAUSTIC_GLSL, SHARED } from '../environment/shaderChunks';

/** Ray-marched light shafts (radiance relative to the water's average glow), drawn at half resolution. */
const SHAFT_FRAGMENT = /* glsl */ `
uniform highp sampler2D uDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
uniform vec3 uWaterExtinction;
uniform float uShaftStrength;
uniform float uHasShadow;
uniform float uFrame;
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
varying vec2 vUv;
${CAUSTIC_GLSL}

// Interleaved gradient noise: per-pixel start offset that turns step banding into fine grain.
float slIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  float depth = texture2D(uDepth, vUv).r;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
  vec3 ro = uCamPos;
  vec3 rd = normalize(wp - ro);
  // March the submerged part of the view ray (to the scene, the surface, or 45 m).
  float tMax = min(length(wp - ro), 45.0);
  if (rd.y > 0.0) tMax = min(tMax, max(-ro.y, 0.0) / rd.y);
  // Steps crowd toward the camera (t ~ s^2), where individual shafts subtend the most screen.
  // The start offset changes every frame so the residual grain averages out like film grain.
  const int STEPS = 24;
  float j = slIgn(gl_FragCoord.xy + mod(uFrame, 64.0) * 5.588238);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float s = (float(i) + j) / float(STEPS);
    float t = tMax * s * s;
    float dt = tMax * 2.0 * s / float(STEPS);
    vec3 p = ro + rd * t;
    float d = max(-p.y, 0.0);
    // Sunlight down to p, then scattered back along the ray to the camera.
    vec3 T = exp(-uWaterExtinction * (d / max(-uSunRefr.y, 0.2) + t));
    float vis = 1.0;
    if (uHasShadow > 0.5) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      if (all(greaterThan(sc.xyz, vec3(0.0))) && all(lessThan(sc.xyz, vec3(1.0)))) {
        vis = texture(uShadowMap, vec3(sc.xy, sc.z - 0.0005));
      }
    }
    // Shafts: sunlight focused by the surface above p, gaps where the curtain or pontoon shades it.
    // Measured against the average glow the water already has, so shafts brighten and shade it.
    acc += T * (slShaftFocus(p) * vis - 0.92) * dt;
  }
  // Forward scattering (Henyey-Greenstein, g = 0.72): brightest looking toward the sun.
  float mu = dot(rd, -uSunRefr);
  float phase = (1.0 - 0.72 * 0.72) / pow(1.0 + 0.72 * 0.72 - 1.44 * mu, 1.5);
  gl_FragColor = vec4(acc * uSunColor * phase * uShaftStrength, 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uShafts;
uniform vec2 uShaftTexel;
uniform float uWobble;

// Everything seen through moving water shimmers a little.
void mainUv(inout vec2 uv) {
  vec2 w = vec2(
    sin(uv.y * 23.0 + time * 1.3) + 0.5 * sin(uv.y * 41.0 - time * 0.9),
    cos(uv.x * 19.0 + time * 1.1) + 0.5 * cos(uv.x * 37.0 + time * 0.7)
  );
  uv += w * uWobble;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // A small rotated-grid blur upsamples the half-resolution shafts and dissolves their grain.
  vec3 s = texture2D(uShafts, uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.4636;
    float r = (i < 4 ? 0.9 : 1.8);
    s += texture2D(uShafts, uv + vec2(cos(a), sin(a)) * r * uShaftTexel).rgb * 0.1;
  }
  outputColor = vec4(max(inputColor.rgb + s, vec3(0.0)), inputColor.a);
}
`;

const shared = (u: { value: unknown }) => u as THREE.IUniform;

/**
 * Underwater view only: volumetric light shafts and a gentle refraction wobble.
 *
 * Each pixel of a half-resolution buffer marches its view ray through the water column. At every
 * step the sunlight reaching that point is the wave-focused light from the surface above it (the
 * same surface model as the caustics, at a coarser scale), dimmed by the water on the way down
 * and back, and cut by the sun's shadow map where the curtain, floats or pontoon shade it.
 * Forward scattering makes the shafts strongest looking toward the sun. The soft result is
 * upsampled onto the frame.
 */
export class UnderwaterEffect extends Effect {
  private readonly sun: THREE.DirectionalLight;
  private readonly shaftTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly shaftMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private frame = 0;

  constructor(camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight) {
    super('UnderwaterEffect', COMPOSITE_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      // The shafts read the scene depth; the composer hands it over through setDepthTexture().
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uShafts', new THREE.Uniform(null)],
        ['uShaftTexel', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ['uWobble', new THREE.Uniform(0.0011)],
      ]),
    });
    this.sun = sun;
    this.shaftTarget.texture.name = 'Underwater.Shafts';
    this.uniforms.get('uShafts')!.value = this.shaftTarget.texture;
    this.shaftMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDepth: { value: null },
        uInvProj: { value: camera.projectionMatrixInverse },
        uCamWorld: { value: camera.matrixWorld },
        uCamPos: { value: camera.position },
        uShaftStrength: { value: 0.03 },
        uHasShadow: { value: 0 },
        uFrame: { value: 0 },
        uShadowMap: { value: null },
        uShadowMatrix: { value: sun.shadow.matrix },
        uSunColor: shared(SHARED.uSunColor),
        uWaterExtinction: shared(SHARED.uWaterExtinction),
        uCaustics: shared(SHARED.uCaustics),
        uCausticFocus: shared(SHARED.uCausticFocus),
        uSunRefr: shared(SHARED.uSunRefr),
        uRippleMap: shared(SHARED.uRippleMap),
        uTime: shared(SHARED.uTime),
        uWaveAmp: shared(SHARED.uWaveAmp),
        uWaveTime: shared(SHARED.uWaveTime),
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: SHAFT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.shaftMaterial);
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.shaftMaterial.uniforms.uDepth.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 2));
    const h = Math.max(1, Math.floor(height / 2));
    this.shaftTarget.setSize(w, h);
    (this.uniforms.get('uShaftTexel')!.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  override update(renderer: THREE.WebGLRenderer): void {
    const u = this.shaftMaterial.uniforms;
    // The shadow map is created lazily on the first shadow render.
    const map = this.sun.shadow.map?.depthTexture ?? null;
    u.uShadowMap.value = map;
    u.uHasShadow.value = map ? 1 : 0;
    u.uFrame.value = this.frame++;
    renderer.setRenderTarget(this.shaftTarget);
    this.quad.render(renderer);
  }

  override dispose(): void {
    super.dispose();
    this.shaftTarget.dispose();
    this.shaftMaterial.dispose();
    this.quad.dispose();
  }
}
