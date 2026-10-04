import * as THREE from 'three';
import { SITE } from '../../config/site';
import type { Marker, SimulationEngine } from '../../simulation/SimulationEngine';
import type { EngineKind } from '../../simulation/types';
import { pointAtArc, type CurtainLayout } from '../../simulation/geometry';
import { makeRingSprite, makeSoftSprite } from '../environment/textures';

interface Flash {
  sprite: THREE.Sprite;
  born: number;
  life: number;
  kind: Marker['kind'];
}

const FLASH_COLORS: Record<Marker['kind'], number> = {
  under: 0xff6a4d,
  overtop: 0xffb347,
  intake: 0xf87171,
  release: 0x5eead4,
};

/**
 * Engineering annotations in the 3D scene: event flashes (under-skirt escapes,
 * intake contacts, releases), the skirt-depth dimension line, a translucent
 * bloom P90-depth plane, the modelled intake capture zone and the selection
 * marker for a picked jellyfish.
 */
export class Annotations {
  readonly group = new THREE.Group();
  /** Event flashes live in per-world groups so each world only shows its own events. */
  private readonly flashGroups: Record<EngineKind, THREE.Group> = { baseline: new THREE.Group(), sweepline: new THREE.Group() };
  private readonly flashes: Record<EngineKind, Flash[]> = { baseline: [], sweepline: [] };
  private readonly flashTex = makeSoftSprite(64, 1.6);
  private readonly lastSeq = new Map<SimulationEngine, number>();
  readonly selection: THREE.Sprite;
  private readonly dimension: THREE.LineSegments;
  private readonly dimMat: THREE.LineBasicMaterial;
  readonly bloomPlane: THREE.Mesh;
  readonly captureZone: THREE.Mesh;
  private dimAnchor = new THREE.Vector3();

  constructor() {
    this.group.name = 'annotations';
    for (const world of ['baseline', 'sweepline'] as EngineKind[]) {
      for (let i = 0; i < 20; i++) {
        const mat = new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        sprite.renderOrder = 40;
        this.flashGroups[world].add(sprite);
        this.flashes[world].push({ sprite, born: -1e9, life: 3, kind: 'under' });
      }
      this.group.add(this.flashGroups[world]);
    }
    this.selection = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeRingSprite(128), color: 0x22d3ee, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.selection.visible = false;
    this.selection.renderOrder = 50;
    this.group.add(this.selection);

    // Skirt depth dimension line (vertical, with end ticks).
    this.dimMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, depthTest: false });
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    this.dimension = new THREE.LineSegments(dg, this.dimMat);
    this.dimension.frustumCulled = false;
    this.dimension.renderOrder = 45;
    this.dimension.visible = false;
    this.group.add(this.dimension);

    // Bloom P90 depth plane (shown underwater).
    this.bloomPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.bloomPlane.visible = false;
    this.bloomPlane.renderOrder = 15;
    this.group.add(this.bloomPlane);

    // Modelled intake capture zone (Flow View).
    const zoneMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vec2 p = vec2(vUv.x - 0.5, vUv.y) * vec2(2.0, 1.0);
          float r = length(p);
          float fill = smoothstep(1.0, 0.0, r) * 0.13;
          float edge = smoothstep(0.04, 0.0, abs(r - 0.92)) * 0.35;
          float a = (fill + edge) * step(0.0, vUv.y);
          gl_FragColor = vec4(vec3(0.97, 0.45, 0.42) * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const I = SITE.intake;
    const width = (I.x1 - I.x0) + 2 * 30;
    this.captureZone = new THREE.Mesh(new THREE.PlaneGeometry(width, 34).rotateX(-Math.PI / 2), zoneMat);
    this.captureZone.geometry.translate(0, 0, 17);
    this.captureZone.position.set((I.x0 + I.x1) / 2, 0.22, I.mouthZ);
    this.captureZone.visible = false;
    this.captureZone.renderOrder = 19;
    this.group.add(this.captureZone);
  }

  /** Spawn flashes for an engine's new markers (in that engine's world). */
  ingestMarkers(engine: SimulationEngine, now: number): void {
    const last = this.lastSeq.get(engine) ?? engine.markerSeq;
    const seq = engine.markerSeq;
    if (seq > last) {
      const cap = engine.markers.length;
      const from = Math.max(last, seq - cap);
      for (let s = from; s < seq; s++) {
        const m = engine.markers[s % Math.max(cap, 1)];
        if (m) this.spawn(engine.kind, m, now);
      }
    }
    this.lastSeq.set(engine, seq);
  }

  /** Show only the given world's event flashes. */
  setWorld(world: EngineKind): void {
    this.flashGroups.baseline.visible = world === 'baseline';
    this.flashGroups.sweepline.visible = world === 'sweepline';
  }

  /** Forget marker history (e.g. after a run restart). */
  reset(): void {
    this.lastSeq.clear();
    for (const list of Object.values(this.flashes)) for (const f of list) f.sprite.visible = false;
  }

  private spawn(world: EngineKind, m: Marker, now: number): void {
    const pool = this.flashes[world];
    let slot = pool[0];
    for (const f of pool) if (f.born < slot.born) slot = f;
    slot.born = now;
    slot.kind = m.kind;
    slot.life = m.kind === 'release' ? 2.2 : 3.2;
    slot.sprite.position.set(m.x, m.y, m.z);
    (slot.sprite.material as THREE.SpriteMaterial).color.set(FLASH_COLORS[m.kind]);
    slot.sprite.visible = true;
  }

  update(now: number, camera: THREE.Camera): void {
    for (const f of [...this.flashes.baseline, ...this.flashes.sweepline]) {
      if (!f.sprite.visible) continue;
      const t = (now - f.born) / f.life;
      if (t >= 1) {
        f.sprite.visible = false;
        continue;
      }
      const dist = camera.position.distanceTo(f.sprite.position);
      const base = Math.max(1.2, dist * 0.035);
      f.sprite.scale.setScalar(base * (0.6 + t * 1.6));
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - t) * (1 - t) * 0.95;
    }
  }

  setSelection(pos: THREE.Vector3 | null, camera: THREE.Camera): void {
    if (!pos) {
      this.selection.visible = false;
      return;
    }
    this.selection.visible = true;
    this.selection.position.copy(pos);
    const d = camera.position.distanceTo(pos);
    this.selection.scale.setScalar(Math.max(0.9, d * 0.06));
    (this.selection.material as THREE.SpriteMaterial).rotation += 0.01;
  }

  /** Dimension line from the float line to the skirt's weighted lower edge at a curtain arc position. */
  updateDimension(layout: CurtainLayout | null, arcFraction: number, skirt: number, visible: boolean): THREE.Vector3 | null {
    if (!layout || !visible || skirt <= 0.05) {
      this.dimension.visible = false;
      return null;
    }
    const p = pointAtArc(layout, layout.length * arcFraction);
    const off = 0.9;
    const x = p.x + p.nx * off;
    const z = p.z + p.nz * off;
    const tick = 0.35;
    const arr = this.dimension.geometry.attributes.position.array as Float32Array;
    const tx = p.tx * tick;
    const tz = p.tz * tick;
    arr.set([x, 0, z, x, -skirt, z, x - tx, 0, z - tz, x + tx, 0, z + tz, x - tx, -skirt, z - tz, x + tx, -skirt, z + tz]);
    this.dimension.geometry.attributes.position.needsUpdate = true;
    this.dimension.visible = true;
    this.dimAnchor.set(x + p.nx * 0.2, -skirt / 2, z + p.nz * 0.2);
    return this.dimAnchor;
  }

  updateBloomPlane(layout: CurtainLayout | null, p90: number, visible: boolean): void {
    if (!layout || !visible) {
      this.bloomPlane.visible = false;
      return;
    }
    const mid = pointAtArc(layout, layout.length * 0.5);
    this.bloomPlane.visible = true;
    this.bloomPlane.position.set(mid.x + mid.nx * 8, -p90, mid.z + mid.nz * 8);
    this.bloomPlane.rotation.y = -Math.atan2(mid.tz, mid.tx);
    this.bloomPlane.scale.set(layout.length * 0.9, 1, 22);
  }
}
