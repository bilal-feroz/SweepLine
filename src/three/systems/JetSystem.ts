import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import type { CurtainState } from '../../simulation/curtain';
import { pointAtArc, type CurtainLayout } from '../../simulation/geometry';
import { waveElevation } from '../../simulation/waves';
import { mediumMaterial } from '../environment/shaderChunks';

const CONVEYOR = 220;
/** The first SURFACE conveyor streaks ride the water surface; the rest run along the skirt. */
const SURFACE = 110;
const FOOT = 110;
const MAX_NOZZLES = 32;

/** A streak made of two crossed quads along +X, so it reads from above and from the side. */
function streakGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

/** Soft additive streak: bright head, fading tail; fades with water depth when seen from above. */
function streakMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying vec2 vUv;
      varying float vAlpha;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      varying vec3 vWorld;
      void main() {
        float along = smoothstep(0.0, 0.75, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
        float across = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 2.0), 1.6);
        float a = along * across * vAlpha;
        if (cameraPosition.y > 0.0 && vWorld.y < 0.0) a *= exp(vWorld.y * 0.45);
        a *= 1.0 - smoothstep(220.0, 480.0, distance(cameraPosition, vWorld));
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

interface Streak {
  s: number;
  off: number;
  depth: number;
  len: number;
  life: number;
  maxLife: number;
  surface: boolean;
}

/**
 * Visualises SweepLine Active's water jets from the curtain's live jet output:
 * a conveyor of fine streaks gliding along the bloom face toward the throat,
 * short streaks rising at the skirt's lower edge (foot jets), and the nozzle
 * heads on the float line. Visual only — the physics lives in the engine.
 */
export class JetSystem {
  readonly group = new THREE.Group();
  private readonly conveyor: THREE.InstancedMesh;
  private readonly surface: THREE.InstancedMesh;
  private readonly foot: THREE.InstancedMesh;
  private readonly nozzles: THREE.InstancedMesh;
  private readonly convAlpha: THREE.InstancedBufferAttribute;
  private readonly surfAlpha: THREE.InstancedBufferAttribute;
  private readonly footAlpha: THREE.InstancedBufferAttribute;
  private readonly conv: Streak[] = [];
  private readonly feet: Streak[] = [];
  private layout: CurtainLayout | null = null;
  private nozzleS: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.name = 'jets';
    const geo = streakGeometry();
    const cg = geo.clone();
    this.convAlpha = new THREE.InstancedBufferAttribute(new Float32Array(CONVEYOR - SURFACE), 1);
    cg.setAttribute('aAlpha', this.convAlpha);
    this.conveyor = new THREE.InstancedMesh(cg, streakMaterial(new THREE.Color(0.55, 0.95, 1.0)), CONVEYOR - SURFACE);
    const sg = geo.clone();
    this.surfAlpha = new THREE.InstancedBufferAttribute(new Float32Array(SURFACE), 1);
    sg.setAttribute('aAlpha', this.surfAlpha);
    this.surface = new THREE.InstancedMesh(sg, streakMaterial(new THREE.Color(0.75, 0.97, 1.0)), SURFACE);
    const fg = geo.clone();
    this.footAlpha = new THREE.InstancedBufferAttribute(new Float32Array(FOOT), 1);
    fg.setAttribute('aAlpha', this.footAlpha);
    this.foot = new THREE.InstancedMesh(fg, streakMaterial(new THREE.Color(0.6, 0.9, 1.0)), FOOT);
    this.nozzles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.5, 12),
      mediumMaterial({ color: 0x22c6e0, emissive: 0x0e6a7a, roughness: 0.4, metalness: 0.2 }, false),
      MAX_NOZZLES,
    );
    for (const mesh of [this.conveyor, this.surface, this.foot, this.nozzles]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    // Underwater streaks draw before the water surface (which blends over them from above);
    // surface current lines draw after it.
    this.conveyor.renderOrder = 7;
    this.foot.renderOrder = 7;
    this.surface.renderOrder = 11;
    this.group.add(this.conveyor, this.surface, this.foot, this.nozzles);
    for (let i = 0; i < CONVEYOR; i++) this.conv.push({ s: 0, off: 0, depth: 0, len: 0, life: 0, maxLife: 1, surface: i < SURFACE });
    for (let i = 0; i < FOOT; i++) this.feet.push({ s: 0, off: 0, depth: 0, len: 0, life: 0, maxLife: 1, surface: false });
  }

  private rebuild(L: CurtainLayout): void {
    this.layout = L;
    this.nozzleS = [];
    const spacing = ASSUMPTIONS.curtain.moduleLength;
    for (let s = spacing * 0.5; s < L.length && this.nozzleS.length < MAX_NOZZLES; s += spacing) this.nozzleS.push(s);
    for (const st of this.conv) this.spawnConveyor(st, L, Math.random());
    for (const st of this.feet) this.spawnFoot(st, L, Math.random());
  }

  private spawnConveyor(st: Streak, L: CurtainLayout, age: number): void {
    st.s = Math.random() * L.length;
    st.off = 0.35 + Math.pow(Math.random(), 1.4) * (ASSUMPTIONS.jets.conveyorBand - 0.6);
    st.depth = Math.random();
    st.len = 1.8 + Math.random() * 1.4;
    st.maxLife = 6 + Math.random() * 8;
    st.life = age * st.maxLife;
  }

  private spawnFoot(st: Streak, L: CurtainLayout, age: number): void {
    st.s = Math.random() * L.length;
    st.off = 0.15 + Math.random() * 1.0;
    st.len = 0.7 + Math.random() * 0.6;
    st.maxLife = 1.4 + Math.random() * 1.6;
    st.life = age * st.maxLife;
  }

  /** Skirt index for an arc position (segments are a few metres long). */
  private segAt(L: CurtainLayout, s: number): number {
    let lo = 0;
    let hi = L.segCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (L.s0[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  update(c: CurtainState, waveTime: number, simDt: number, waveHeight: number): void {
    const L = c.layout;
    if (L !== this.layout) this.rebuild(L);
    const laidFrom = L.length - c.deployFront;
    const deployed = c.mode !== 'STOWED' && c.activeCount > 0;
    this.group.visible = deployed;
    if (!deployed) return;
    const jet = c.jetOutput;
    const J = ASSUMPTIONS.jets;

    // Conveyor: streaks travel along the face at the modelled wall-jet speed for their distance from it.
    for (let i = 0; i < CONVEYOR; i++) {
      const st = this.conv[i];
      const v = jet * J.conveyorSpeed * Math.pow(1 - st.off / J.conveyorBand, 2);
      st.s += v * simDt;
      st.life += simDt;
      if (st.life > st.maxLife || st.s > L.length - 1.5) this.spawnConveyor(st, L, 0);
      const k = this.segAt(L, st.s);
      const live = jet > 0.01 && c.segActive[k] === 1 && st.s >= laidFrom;
      const lt = st.life / st.maxLife;
      const fade = Math.min(1, lt * 4) * Math.min(1, (1 - lt) * 4);
      const alpha = live ? fade * (0.4 + 0.6 * jet) * (st.surface ? 0.8 : 0.7) : 0;
      if (st.surface) this.surfAlpha.setX(i, alpha);
      else this.convAlpha.setX(i - SURFACE, alpha);
      const f = pointAtArc(L, st.s);
      const skirt = Math.max(0.4, c.segSkirt[k]);
      const px = f.x + f.nx * st.off;
      const pz = f.z + f.nz * st.off;
      // Near-surface jets show as current lines on the water; deeper ones as streaks along the skirt.
      const y = st.surface ? waveElevation(px, pz, waveTime, waveHeight) + 0.03 : -(0.35 + st.depth * Math.max(0.1, skirt * 0.85 - 0.35));
      this.p.set(px, y, pz);
      this.q.setFromAxisAngle(this.yAxis, -Math.atan2(f.tz, f.tx));
      this.sc.set(st.len, 0.3, 0.3);
      this.m.compose(this.p, this.q, this.sc);
      if (st.surface) this.surface.setMatrixAt(i, this.m);
      else this.conveyor.setMatrixAt(i - SURFACE, this.m);
    }

    // Foot jets: short streaks shooting up from the weighted hem on the bloom side.
    for (let i = 0; i < FOOT; i++) {
      const st = this.feet[i];
      st.life += simDt;
      if (st.life > st.maxLife) this.spawnFoot(st, L, 0);
      const k = this.segAt(L, st.s);
      const live = jet > 0.01 && c.segActive[k] === 1 && st.s >= laidFrom;
      const lt = st.life / st.maxLife;
      const fade = Math.min(1, lt * 5) * Math.min(1, (1 - lt) * 3);
      this.footAlpha.setX(i, live ? fade * jet * 0.7 : 0);
      const f = pointAtArc(L, st.s);
      const hem = c.segSkirt[k];
      const y = -hem - 0.9 + lt * 1.3;
      this.p.set(f.x + f.nx * st.off, y, f.z + f.nz * st.off);
      this.q.setFromAxisAngle(this.yAxis, -Math.atan2(f.tz, f.tx)).multiply(this.qRoll);
      this.sc.set(st.len, 0.22, 0.22);
      this.m.compose(this.p, this.q, this.sc);
      this.foot.setMatrixAt(i, this.m);
    }

    // Nozzle heads on the float line, one per curtain module, wherever that module is at the surface.
    let n = 0;
    for (const s of this.nozzleS) {
      if (s < laidFrom || c.riseAt(s) < 1) continue;
      const f = pointAtArc(L, s);
      const eta = waveElevation(f.x, f.z, waveTime, waveHeight);
      this.p.set(f.x + f.nx * 0.42, eta + 0.08, f.z + f.nz * 0.42);
      this.q.identity();
      this.sc.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.sc);
      this.nozzles.setMatrixAt(n++, this.m);
    }
    this.nozzles.count = n;

    for (const mesh of [this.conveyor, this.surface, this.foot, this.nozzles]) mesh.instanceMatrix.needsUpdate = true;
    this.convAlpha.needsUpdate = true;
    this.surfAlpha.needsUpdate = true;
    this.footAlpha.needsUpdate = true;
  }
}
