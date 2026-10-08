import * as THREE from 'three';
import { SeededRandom } from '../../simulation/seededRandom';
import { SHARED } from './shaderChunks';

/**
 * Camera-local underwater particulate (marine snow). It wraps around the camera on a
 * world-anchored tile so it feels infinite without following the camera rigidly. Only shown
 * below the surface. Light shafts are volumetric, in post-processing (UnderwaterEffect).
 */
export class UnderwaterFx {
  readonly group = new THREE.Group();
  private readonly snow: THREE.Points;

  constructor() {
    this.group.name = 'underwater-fx';
    this.snow = this.buildSnow();
    this.group.add(this.snow);
    this.group.visible = false;
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
