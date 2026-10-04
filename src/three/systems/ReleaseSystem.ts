import * as THREE from 'three';
import { SITE } from '../../config/site';
import { waveElevation } from '../../simulation/waves';
import { mediumMaterial, SHARED } from '../environment/shaderChunks';

/** Safe-release outlet (down-current, outside the intake capture area), marker buoy, zone ring and plume. */
export class ReleaseSystem {
  readonly group = new THREE.Group();
  private readonly buoy: THREE.Group;
  private readonly ringMat: THREE.ShaderMaterial;
  private readonly plumeMat: THREE.ShaderMaterial;
  private readonly lampMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group.name = 'release';
    const r = SITE.release;
    const dir = new THREE.Vector3(r.dirX, 0, r.dirZ).normalize();
    const yaw = -Math.atan2(dir.z, dir.x);

    // Flared outlet diffuser, angled down into the water column.
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      profile.push(new THREE.Vector2(0.62 + 0.75 * Math.pow(t, 2.2), t * 2.6));
    }
    const diffuser = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 28),
      mediumMaterial({ color: 0x1d2a30, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }),
    );
    diffuser.rotation.set(0, yaw, -Math.PI / 2 - 0.35);
    diffuser.position.set(r.x - dir.x * 2.6, -0.2, r.z - dir.z * 2.6);
    diffuser.userData.pick = 'release';
    this.group.add(diffuser);

    // Special-mark buoy with X topmark and light.
    this.buoy = new THREE.Group();
    const yellow = mediumMaterial({ color: 0xf2c230, roughness: 0.45 }, false);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.6, 18), yellow);
    body.position.y = 0.45;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), yellow);
    mast.position.y = 1.9;
    const xa = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), yellow);
    xa.position.y = 2.75;
    xa.rotation.z = Math.PI / 4;
    const xb = xa.clone();
    xb.rotation.z = -Math.PI / 4;
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd36b });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.lampMat);
    lamp.position.y = 3.15;
    this.buoy.add(body, mast, xa, xb, lamp);
    this.buoy.position.set(r.x + dir.z * 9, 0, r.z - dir.x * 9);
    this.buoy.traverse((o) => (o.userData.pick = 'release'));
    this.group.add(this.buoy);

    // Release zone ring (dashed, slowly rotating).
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uOpacity: { value: 0.55 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float ring = smoothstep(0.035, 0.0, abs(r - 0.93));
          float dash = step(0.5, fract(a * 9.549 + uTime * 0.05));
          float inner = smoothstep(0.93, 0.2, r) * 0.08;
          float alpha = (ring * dash + inner) * uOpacity;
          gl_FragColor = vec4(vec3(0.3, 0.92, 0.85) * alpha, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), this.ringMat);
    ring.position.set(r.x + dir.x * 8, 0.3, r.z + dir.z * 8);
    ring.renderOrder = 22;
    this.group.add(ring);

    // Down-current plume (released animals carried away by the current).
    this.plumeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uStrength: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          float along = vUv.x;
          float w = 0.12 + 0.38 * along;
          float lat = abs(vUv.y - 0.5) / w;
          float body = smoothstep(1.0, 0.0, lat) * smoothstep(0.0, 0.08, along) * smoothstep(1.0, 0.45, along);
          float streak = 0.75 + 0.25 * sin(along * 40.0 - uTime * 1.2 + vUv.y * 9.0);
          float a = body * streak * uStrength * 0.16;
          gl_FragColor = vec4(vec3(0.25, 0.85, 0.8) * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const plume = new THREE.Mesh(new THREE.PlaneGeometry(90, 34).rotateX(-Math.PI / 2), this.plumeMat);
    plume.geometry.translate(45, 0, 0);
    plume.rotation.y = 0;
    plume.position.set(r.x, 0.2, r.z);
    plume.rotation.set(0, yaw, 0);
    plume.renderOrder = 21;
    this.group.add(plume);
  }

  update(releaseRate: number, active: boolean, time: number, waveTime: number, waveHeight: number): void {
    const p = this.buoy.position;
    p.y = waveElevation(p.x, p.z, waveTime, waveHeight) - 0.2;
    this.buoy.rotation.z = Math.sin(time * 0.9) * 0.06;
    this.plumeMat.uniforms.uStrength.value = Math.min(1, releaseRate * 14);
    this.ringMat.uniforms.uOpacity.value = active ? 0.6 : 0.2;
    this.lampMat.color.setRGB(1, 0.83, 0.42).multiplyScalar(Math.sin(time * 3) > 0.6 ? 1 : 0.25);
  }

  anchor(): THREE.Vector3 {
    return new THREE.Vector3(SITE.release.x + 6, 2.5, SITE.release.z + 3);
  }
}
