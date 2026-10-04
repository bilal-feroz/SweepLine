import * as THREE from 'three';
import { SEABED_DEPTH_GLSL } from '../../config/site';
import { WAVES_GLSL } from '../../simulation/waves';
import { MEDIUM_GLSL, SHARED } from './shaderChunks';
import { makeWaterNormalMap } from './textures';

/** Grid coordinates: dense in the working area, geometrically coarser toward the horizon. */
function axisCoords(core: number, spacing: number, outer: number, outerSegs: number): number[] {
  const out: number[] = [];
  const n = Math.round(core / spacing);
  const ratio = Math.pow(outer / core, 1 / outerSegs);
  const ext: number[] = [];
  let v = core;
  for (let i = 0; i < outerSegs; i++) {
    v *= ratio;
    ext.push(v);
  }
  for (let i = ext.length - 1; i >= 0; i--) out.push(-ext[i]);
  for (let i = -n; i <= n; i++) out.push(i * spacing);
  for (const e of ext) out.push(e);
  return out;
}

function buildGrid(): THREE.BufferGeometry {
  const xs = axisCoords(380, 2.5, 7000, 26);
  const zs = axisCoords(320, 2.5, 7000, 26);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  let k = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      pos[k++] = xs[i];
      pos[k++] = 0;
      pos[k++] = zs[j];
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const CENTER = new THREE.Vector2(-10, 40);

/**
 * Ocean surface: shared analytic sea state (vertex), detail normals,
 * Fresnel sky reflection, sun glitter, and a Snell's-window underside.
 * Underwater colour/absorption is applied to submerged objects themselves,
 * so the surface stays partially transparent and the bloom reads from above.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(envCube: THREE.CubeTexture) {
    const normalMap = makeWaterNormalMap(256);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uWaveAmp: SHARED.uWaveAmp,
        uWaveTime: SHARED.uWaveTime,
        uTime: SHARED.uTime,
        uSunDir: SHARED.uSunDir,
        uSunColor: SHARED.uSunColor,
        uWaterExtinction: SHARED.uWaterExtinction,
        uWaterScatter: SHARED.uWaterScatter,
        uHazeColor: SHARED.uHazeColor,
        uHazeDensity: SHARED.uHazeDensity,
        uFlowDim: SHARED.uFlowDim,
        uEnv: { value: envCube },
        uNormalMap: { value: normalMap },
        uShallow: { value: new THREE.Color(0.03, 0.34, 0.36) },
        uDeep: { value: new THREE.Color(0.006, 0.07, 0.13) },
        uCenter: { value: CENTER },
      },
      vertexShader: /* glsl */ `
        ${WAVES_GLSL}
        uniform vec2 uCenter;
        varying vec3 vWorld;
        varying vec2 vSlope;
        varying float vElev;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float fade = 1.0 - smoothstep(380.0, 900.0, length(wp.xz - uCenter));
          vec2 slope;
          float e = waveElevation(wp.xz, slope) * fade;
          wp.y += e;
          vWorld = wp.xyz;
          vSlope = slope * fade;
          vElev = e;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform samplerCube uEnv;
        uniform sampler2D uNormalMap;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uTime;
        uniform float uWaveAmp;
        varying vec3 vWorld;
        varying vec2 vSlope;
        varying float vElev;
        ${MEDIUM_GLSL}
        ${SEABED_DEPTH_GLSL}
        void main() {
          float dist = length(cameraPosition - vWorld);
          vec2 uv1 = vWorld.xz / 23.0 + vec2(uTime * 0.013, uTime * 0.009);
          vec2 uv2 = vWorld.xz / 8.5 + vec2(-uTime * 0.021, uTime * 0.014);
          vec2 uv3 = vWorld.xz / 3.1 + vec2(uTime * 0.03, -uTime * 0.025);
          vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNormalMap, uv3).xyz * 2.0 - 1.0;
          float chop = 0.55 + uWaveAmp * 0.9;
          vec2 detail = (n1.xy * 0.6 + n2.xy * 0.4 + n3.xy * 0.22 * (1.0 - smoothstep(20.0, 120.0, dist))) * 0.46 * chop;
          detail *= 1.0 - smoothstep(180.0, 1600.0, dist) * 0.85;
          vec3 N = normalize(vec3(-vSlope.x - detail.x, 1.0, -vSlope.y - detail.y));
          vec3 V = normalize(cameraPosition - vWorld);

          if (gl_FrontFacing) {
            float NdV = max(dot(N, V), 0.0);
            float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
            vec3 R = reflect(-V, N);
            R.y = abs(R.y);
            vec3 refl = textureCube(uEnv, R).rgb;
            float sr = max(dot(R, uSunDir), 0.0);
            float glint = pow(sr, 900.0) * 10.0 + pow(sr, 140.0) * 0.55;
            float depth = seabedDepth(vWorld.xz);
            vec3 body = mix(uShallow, uDeep, smoothstep(2.0, 14.0, depth));
            float crest = clamp(vElev / max(uWaveAmp, 0.05), 0.0, 1.0);
            vec3 sss = vec3(0.05, 0.32, 0.30) * pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 3.0) * crest * 0.35;
            vec3 col = body * 0.55 + sss;
            col = mix(col, refl * 0.92, F) + uSunColor * glint * (1.0 - uFlowDim * 0.6);
            // Wave-break foam along the revetment waterline.
            float shore = smoothstep(-52.5, -56.8, vWorld.z) * step(-58.5, vWorld.z);
            float foamN = texture2D(uNormalMap, vWorld.xz / 6.0 + vec2(uTime * 0.02, 0.0)).x;
            float foam = shore * smoothstep(0.45, 0.75, foamN + 0.35 * sin(vWorld.x * 0.21 + uTime * 0.9)) * (0.6 + uWaveAmp);
            col = mix(col, vec3(0.78, 0.86, 0.88), clamp(foam, 0.0, 0.85));
            float alpha = mix(0.4 + 0.2 * smoothstep(4.0, 14.0, depth), 1.0, F);
            alpha = max(alpha, clamp(foam, 0.0, 0.85));
            alpha = mix(alpha, 1.0, smoothstep(250.0, 1800.0, dist));
            col = slMedium(col, vWorld);
            gl_FragColor = vec4(col, alpha);
          } else {
            // Seen from below: Snell's window to the sky, total internal reflection outside it.
            vec3 I = normalize(vWorld - cameraPosition);
            float cosI = dot(I, N);
            float window = smoothstep(0.62, 0.71, cosI);
            vec3 skyIn = mix(vec3(0.25, 0.55, 0.62), vec3(0.65, 0.85, 0.92), window) * window;
            vec3 sunU = normalize(vec3(uSunDir.x * 0.72, uSunDir.y, uSunDir.z * 0.72));
            float sd = max(dot(I, sunU), 0.0);
            // Outside the window the underside mirrors the bright water column; ripples catch light.
            float ripple = 0.5 + 0.5 * (n1.x * 0.6 + n2.y * 0.4);
            vec3 tir = uWaterScatter * (3.2 + 2.2 * ripple) + vec3(0.02, 0.06, 0.06) * pow(ripple, 3.0);
            vec3 col = mix(tir, skyIn * 1.5, window) + uSunColor * (pow(sd, 260.0) * 6.0 + pow(sd, 18.0) * 0.35) * window;
            col = slMedium(col, vWorld);
            gl_FragColor = vec4(col, 1.0);
          }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(buildGrid(), this.material);
    this.mesh.position.set(CENTER.x, 0, CENTER.y);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'water';
  }

  /** Render the surface after submerged content from above, and first (opaque) from below. */
  configureForCamera(underwater: boolean): void {
    this.mesh.renderOrder = underwater ? -10 : 10;
    this.material.depthWrite = underwater;
  }
}
