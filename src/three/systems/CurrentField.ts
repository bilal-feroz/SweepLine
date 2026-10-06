import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { nearestSegment, SegmentHit } from '../../simulation/geometry';
import type { SimulationEngine } from '../../simulation/SimulationEngine';

const REGION = { x0: -250, x1: 250, z0: -47, z1: 150 };
const MAX = 5200;

/**
 * Flow visualisation for one world: advected streak particles plus a grid of
 * direction arrows (Flow View). Particles use the same current field as the
 * agents; near an active curtain they are deflected along it above the skirt
 * and pass beneath it below — so the physics is visible without reading.
 */
export class CurrentField {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly lineMat: THREE.ShaderMaterial;
  private readonly arrows: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly pd = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vz = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly tmp = { x: 0, z: 0 };
  private readonly hit = new SegmentHit();
  private arrowTimer = 0;
  private flowMode = false;
  private initialised = false;
  private readonly arrowPos: Array<[number, number]> = [];

  constructor(name: string) {
    this.group.name = name;
    this.positions = new Float32Array(MAX * 6);
    this.colors = new Float32Array(MAX * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lineMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        varying vec3 vWorld;
        void main() {
          vColor = color;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying vec3 vWorld;
        void main() {
          float under = 0.0;
          vec3 cam = cameraPosition;
          float dist = length(vWorld - cam);
          if (cam.y >= 0.0 && vWorld.y < 0.0) under = dist * (1.0 - cam.y / max(cam.y - vWorld.y, 1e-4));
          else if (cam.y < 0.0) under = dist;
          float T = exp(-0.11 * under) * (1.0 - smoothstep(180.0, 420.0, dist));
          gl_FragColor = vec4(vColor * uOpacity * T, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geo, this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    this.group.add(this.lines);

    // Arrow grid for Flow View.
    // Slim chevron glyph.
    const shape = new THREE.Shape();
    shape.moveTo(1.0, 0);
    shape.lineTo(-0.35, 0.55);
    shape.lineTo(-0.1, 0);
    shape.lineTo(-0.35, -0.55);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape);
    arrowGeo.rotateX(-Math.PI / 2);
    for (let x = -230; x <= 230; x += 13) {
      for (let z = -42; z <= 140; z += 13) {
        if (x > SITE.intake.x0 - 2 && x < SITE.intake.x1 + 2 && z < SITE.intake.mouthZ + 1) continue;
        this.arrowPos.push([x, z]);
      }
    }
    const arrowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, this.arrowPos.length);
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 21;
    this.arrows.visible = false;
    const c = new THREE.Color(0.2, 0.8, 0.95);
    for (let i = 0; i < this.arrowPos.length; i++) this.arrows.setColorAt(i, c);
    this.group.add(this.arrows);
  }

  private respawn(i: number, upstream: boolean): void {
    const r = REGION;
    let x: number;
    let z: number;
    for (let tries = 0; tries < 6; tries++) {
      x = upstream ? r.x0 + Math.random() * 40 : r.x0 + Math.random() * (r.x1 - r.x0);
      z = r.z0 + Math.pow(Math.random(), 1.25) * (r.z1 - r.z0);
      const insideIntake = x > SITE.intake.x0 - 1 && x < SITE.intake.x1 + 1 && z < SITE.intake.mouthZ + 1;
      if (!insideIntake) break;
    }
    this.px[i] = x!;
    this.pz[i] = z!;
    this.pd[i] = this.flowMode ? 0.15 + Math.pow(Math.random(), 1.6) * 4.6 : 0.1;
    this.maxLife[i] = (this.flowMode ? 22 : 14) + Math.random() * 14;
    this.life[i] = 0;
    this.vx[i] = 0;
    this.vz[i] = 0;
  }

  setFlowMode(on: boolean): void {
    if (on === this.flowMode && this.initialised) return;
    this.flowMode = on;
    this.arrows.visible = on;
    for (let i = 0; i < MAX; i++) this.respawn(i, false);
    for (let i = 0; i < MAX; i++) this.life[i] = Math.random() * this.maxLife[i];
    this.initialised = true;
  }

  update(engine: SimulationEngine, dtSim: number, dtReal: number): void {
    if (!this.initialised) this.setFlowMode(false);
    const n = this.flowMode ? MAX : 900;
    const flow = engine.flow;
    const curtain = engine.curtain && engine.curtain.activeCount > 0 ? engine.curtain : null;
    const conveyor = curtain ? curtain.jetOutput * ASSUMPTIONS.jets.conveyorSpeed : 0;
    const band = ASSUMPTIONS.jets.conveyorBand;
    const layout = engine.curtain?.layout ?? null;
    const tmp = this.tmp;
    const hit = this.hit;
    const dt = Math.min(dtSim, 2.5);
    const trail = this.flowMode ? 16 : 9;
    const intake = SITE.intake;
    const pos = this.positions;
    const col = this.colors;
    for (let i = 0; i < n; i++) {
      let x = this.px[i];
      let z = this.pz[i];
      const depth = this.pd[i];
      flow.sample(x, z, depth, tmp);
      if (curtain && layout && nearestSegment(layout, x, z, hit) && hit.within) {
        const k = hit.seg;
        if (curtain.segActive[k] && depth < curtain.segSkirt[k]) {
          const d = hit.d;
          const nx = layout.nx[k];
          const nz = layout.nz[k];
          if (d > 0 && d < 10) {
            // Surface flow ahead of the curtain turns to run along it (wider than the agent contact zone).
            const g0 = 1 - d / 10;
            const g = g0 * g0 * (3 - 2 * g0);
            const vin = -(tmp.x * nx + tmp.z * nz);
            if (vin > 0) {
              tmp.x += nx * vin * g + layout.tx[k] * vin * g * 0.9;
              tmp.z += nz * vin * g + layout.tz[k] * vin * g * 0.9;
            }
            // Conveyor jets: a wall jet along the face toward the throat.
            if (conveyor > 0 && d < band) {
              const w = (1 - d / band) * (1 - d / band) * conveyor;
              tmp.x += layout.tx[k] * w;
              tmp.z += layout.tz[k] * w;
            }
          } else if (d <= 0 && d > -12) {
            const shelter = 0.55 * (1 + d / 12);
            tmp.x *= 1 - shelter;
            tmp.z *= 1 - shelter;
          }
        }
      }
      this.vx[i] += (tmp.x - this.vx[i]) * 0.5;
      this.vz[i] += (tmp.z - this.vz[i]) * 0.5;
      x += this.vx[i] * dt;
      z += this.vz[i] * dt;
      this.life[i] += dt;
      const outside =
        x > REGION.x1 || x < REGION.x0 - 5 || z > REGION.z1 + 10 || z < SITE.shore.toeZ - 2 || (x > intake.x0 && x < intake.x1 && z < intake.mouthZ + 0.5);
      if (this.life[i] > this.maxLife[i] || outside) {
        this.respawn(i, Math.random() < 0.35);
        x = this.px[i];
        z = this.pz[i];
      }
      this.px[i] = x;
      this.pz[i] = z;
      const speed = Math.hypot(this.vx[i], this.vz[i]);
      const lt = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, lt * 5) * Math.min(1, (1 - lt) * 4);
      const y = -depth + (this.flowMode ? 0 : 0.18);
      const o = i * 6;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - this.vx[i] * trail;
      pos[o + 4] = y;
      pos[o + 5] = z - this.vz[i] * trail;
      let r: number;
      let g: number;
      let b: number;
      if (this.flowMode) {
        const t = Math.min(1, speed / 0.55);
        r = 0.08 + 0.8 * t * t;
        g = 0.45 + 0.55 * t;
        b = 0.6 + 0.4 * t;
        const k = fade * 0.95;
        r *= k;
        g *= k;
        b *= k;
      } else {
        const k = fade * 0.11;
        r = 0.55 * k;
        g = 0.85 * k;
        b = 1.0 * k;
      }
      col[o] = r;
      col[o + 1] = g;
      col[o + 2] = b;
      col[o + 3] = 0;
      col[o + 4] = 0;
      col[o + 5] = 0;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, n * 2);
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const ca = geo.attributes.color as THREE.BufferAttribute;
    pa.clearUpdateRanges();
    pa.addUpdateRange(0, n * 6);
    pa.needsUpdate = true;
    ca.clearUpdateRanges();
    ca.addUpdateRange(0, n * 6);
    ca.needsUpdate = true;

    if (this.flowMode) {
      this.arrowTimer -= dtReal;
      if (this.arrowTimer <= 0) {
        this.arrowTimer = 0.35;
        this.updateArrows(engine);
      }
    }
  }

  private readonly am = new THREE.Matrix4();
  private readonly aq = new THREE.Quaternion();
  private readonly ap = new THREE.Vector3();
  private readonly as = new THREE.Vector3();
  private readonly ac = new THREE.Color();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  private updateArrows(engine: SimulationEngine): void {
    const flow = engine.flow;
    const curtain = engine.curtain && engine.curtain.activeCount > 0 ? engine.curtain : null;
    const conveyor = curtain ? curtain.jetOutput * ASSUMPTIONS.jets.conveyorSpeed : 0;
    const band = ASSUMPTIONS.jets.conveyorBand;
    const layout = engine.curtain?.layout ?? null;
    for (let i = 0; i < this.arrowPos.length; i++) {
      const [x, z] = this.arrowPos[i];
      flow.sample(x, z, 0.5, this.tmp);
      if (curtain && layout && nearestSegment(layout, x, z, this.hit) && this.hit.within) {
        const k = this.hit.seg;
        if (curtain.segActive[k]) {
          const d = this.hit.d;
          const nx = layout.nx[k];
          const nz = layout.nz[k];
          if (d > 0 && d < 12) {
            const g = 1 - d / 12;
            const vin = -(this.tmp.x * nx + this.tmp.z * nz);
            if (vin > 0) {
              this.tmp.x += nx * vin * g + layout.tx[k] * vin * g * 0.8;
              this.tmp.z += nz * vin * g + layout.tz[k] * vin * g * 0.8;
            }
            if (conveyor > 0 && d < band) {
              const w = (1 - d / band) * (1 - d / band) * conveyor;
              this.tmp.x += layout.tx[k] * w;
              this.tmp.z += layout.tz[k] * w;
            }
          } else if (d <= 0 && d > -12) {
            const shelter = 0.55 * (1 + d / 12);
            this.tmp.x *= 1 - shelter;
            this.tmp.z *= 1 - shelter;
          }
        }
      }
      const sp = Math.hypot(this.tmp.x, this.tmp.z);
      this.aq.setFromAxisAngle(this.yAxis, -Math.atan2(this.tmp.z, this.tmp.x));
      const sc = 0.8 + Math.min(sp, 0.8) * 3.4;
      this.ap.set(x, 0.28, z);
      this.as.set(sc, 1, sc * 0.8);
      this.am.compose(this.ap, this.aq, this.as);
      this.arrows.setMatrixAt(i, this.am);
      const t = Math.min(1, sp / 0.5);
      this.ac.setRGB(0.1 + 0.85 * t * t, 0.55 + 0.45 * t, 0.7 + 0.3 * t);
      this.arrows.setColorAt(i, this.ac);
    }
    this.arrows.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
  }
}
