import * as THREE from 'three';
import { ATMOSPHERE_GLSL, atmosphereFor } from './atmosphere';
import { SHARED } from './shaderChunks';

/** Thin, streaky high cirrus: sunlit, brightest toward the sun, melting into the haze near the horizon. */
const CIRRUS_GLSL = /* glsl */ `
float slHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float slValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = slHash(i);
  float b = slHash(i + vec2(1.0, 0.0));
  float c = slHash(i + vec2(0.0, 1.0));
  float d = slHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float slCloudFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * slValueNoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
vec4 slCirrus(vec3 d, vec3 s) {
  if (d.y <= 0.0) return vec4(0.0);
  vec2 uv = d.xz / (d.y + 0.12);
  vec2 q = vec2(uv.x * 0.9 + uv.y * 0.4, uv.y * 2.6 - uv.x * 0.7);
  float base = slCloudFbm(q * 0.9 + vec2(4.3, 1.7));
  float wisps = slCloudFbm(q * 3.1 + base * 1.8);
  float cover = smoothstep(0.6, 0.9, base * 0.7 + wisps * 0.42) * smoothstep(0.03, 0.25, d.y) * 0.55;
  float mu = max(dot(d, s), 0.0);
  return vec4(vec3(1.0, 0.97, 0.93) * (1.0 + 1.8 * pow(mu, 10.0)), cover);
}
`;

/** The sky's radiance (atmosphere + cirrus) for baking into the cube map: no sun disc, linear HDR. */
function bakeMaterial(scale: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: SHARED.uSunDir,
      uScale: { value: scale },
      uGround: { value: new THREE.Color(0.2, 0.26, 0.3) },
      uCloudBright: { value: 1.05 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform float uScale;
      uniform vec3 uGround;
      uniform float uCloudBright;
      ${ATMOSPHERE_GLSL}
      ${CIRRUS_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        // Below the horizon the view meets the sea and land: horizon haze fading to the ground tone.
        vec3 h = normalize(vec3(d.x, max(d.y, 0.004), d.z));
        vec3 col = slSky(h, uSunDir) * uScale;
        if (d.y < 0.0) {
          col = mix(col * 0.92, uGround, smoothstep(0.0, 0.22, -d.y));
        } else {
          vec4 c = slCirrus(d, uSunDir);
          col = mix(col, c.rgb * uCloudBright, c.a);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
}

/** The visible dome: the baked sky plus a sharp sun disc; underwater, the open-water colour. */
function domeMaterial(sky: THREE.CubeTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSky: { value: sky },
      uSunDir: SHARED.uSunDir,
      uSunColor: SHARED.uSunColor,
      uWaterScatter: SHARED.uWaterScatter,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform samplerCube uSky;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uWaterScatter;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = textureCube(uSky, d).rgb;
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * pow(s, 1400.0) * 46.0;
        // Camera below the surface: open water fades to the in-scattered water colour.
        if (cameraPosition.y < 0.0) {
          float depthDim = exp(cameraPosition.y * 0.09);
          col = uWaterScatter * (0.45 + 0.55 * depthDim) * (2.3 + 1.4 * clamp(d.y, -0.6, 1.0));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/**
 * Hazy Gulf daylight sky: a physically based clear-sky atmosphere (Rayleigh + dusty Mie
 * scattering, see atmosphere.ts) with thin cirrus, baked once into a cube map that serves the
 * visible dome, the water's reflections and the PBR image-based lighting. `horizon` is the
 * horizon radiance, used as the haze colour so distant water and land fade into the actual sky.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  readonly envMap: THREE.Texture;
  readonly horizon: THREE.Color;

  constructor(renderer: THREE.WebGLRenderer) {
    const { scale, horizon } = atmosphereFor(SHARED.uSunDir.value);
    this.horizon = horizon;
    const geo = new THREE.SphereGeometry(1000, 48, 24);

    const bakeScene = new THREE.Scene();
    const bakeMat = bakeMaterial(scale);
    bakeScene.add(new THREE.Mesh(geo, bakeMat));
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(1, 2000, this.cubeTarget);
    cubeCam.update(renderer, bakeScene);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromCubemap(this.cubeTarget.texture).texture;
    pmrem.dispose();
    bakeMat.dispose();

    this.mesh = new THREE.Mesh(geo, domeMaterial(this.cubeTarget.texture));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  /** Keep the dome centred on the camera. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
