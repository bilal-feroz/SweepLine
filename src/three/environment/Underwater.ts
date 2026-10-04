import * as THREE from 'three';
import { SeededRandom } from '../../simulation/seededRandom';
import { SHARED } from './shaderChunks';

/**
 * Camera-local underwater atmosphere: sun shafts and suspended particulate.
 * Both wrap around the camera on a world-anchored tile so they feel infinite
 * without following the camera rigidly. Only shown below the surface.
 */
export class UnderwaterFx {
  readonly group = new THREE.Group();
  private readonly rays: THREE.Mesh;
  private readonly snow: THREE.Points;

  constructor() {
    this.group.name = 'underwater-fx';
    this.rays = this.buildRays();
    this.snow = this.buildSnow();
    this.group.add(this.rays, this.snow);
    this.group.visible = false;
  }

  private buildRays(): THREE.Mesh {
    const rng = new SeededRandom(99);
    const count = 22;
    const base = new THREE.PlaneGeometry(1, 1, 1, 8);
    base.translate(0, -0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const offsets = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offsets[i * 4] = rng.range(-24, 24);
      offsets[i * 4 + 1] = rng.range(-24, 24);
      offsets[i * 4 + 2] = rng.range(1.2, 4.8);
      offsets[i * 4 + 3] = rng.next() * 100;
    }
    geo.setAttribute('aRay', new THREE.InstancedBufferAttribute(offsets, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uSunDir: SHARED.uSunDir },
      vertexShader: /* glsl */ `
        attribute vec4 aRay;
        uniform vec3 uSunDir;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFlicker;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec2 cam = cameraPosition.xz;
          vec2 base = cam + mod(aRay.xy - cam + 24.0, 48.0) - 24.0;
          float height = 16.0;
          vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
          // Refracted shafts lean away from the sun's azimuth.
          float lean = 0.42;
          vec3 top = vec3(base.x, 0.0, base.y);
          vec3 dir = normalize(vec3(-sunH.x * lean, -1.0, -sunH.z * lean));
          vec3 along = dir * height * (-position.y);
          vec3 toCam = normalize(cameraPosition - (top + along));
          vec3 right = normalize(cross(dir, toCam));
          vec3 wp = top + along + right * position.x * aRay.z;
          vDepth = -wp.y;
          vFlicker = 0.55 + 0.45 * sin(uTime * 0.6 + aRay.w) * sin(uTime * 0.23 + aRay.w * 1.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFlicker;
        varying float vDepth;
        void main() {
          float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          float a = edge * edge * fade * vFlicker * 0.11 * exp(-vDepth * 0.055);
          gl_FragColor = vec4(vec3(0.62, 0.9, 0.92) * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 30;
    return mesh;
  }

  private buildSnow(): THREE.Points {
    const rng = new SeededRandom(321);
    const count = 2600;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-16, 16);
      pos[i * 3 + 1] = rng.range(-16, 16);
      pos[i * 3 + 2] = rng.range(-16, 16);
      seed[i] = rng.next();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uPixelRatio: { value: 1 }, uDrift: { value: new THREE.Vector2(0.3, 0.05) } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec2 uDrift;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += uDrift.x * uTime + sin(uTime * 0.3 + aSeed * 40.0) * 0.3;
          p.z += uDrift.y * uTime + cos(uTime * 0.27 + aSeed * 31.0) * 0.3;
          p.y += sin(uTime * 0.2 + aSeed * 17.0) * 0.4 - uTime * 0.02;
          vec3 cam = cameraPosition;
          vec3 wp = cam + mod(p - cam + 16.0, 32.0) - 16.0;
          wp.y = min(wp.y, -0.2);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float d = -mv.z;
          vAlpha = smoothstep(16.0, 4.0, d) * smoothstep(0.2, 1.2, d) * (0.35 + 0.65 * aSeed);
          gl_PointSize = uPixelRatio * (1.0 + 2.2 * aSeed) * 14.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, r) * vAlpha * 0.55;
          gl_FragColor = vec4(vec3(0.75, 0.92, 0.95) * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 31;
    return pts;
  }

  update(underwater: boolean, pixelRatio: number): void {
    this.group.visible = underwater;
    (this.snow.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio;
  }
}
