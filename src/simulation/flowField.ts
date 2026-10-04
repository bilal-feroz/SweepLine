import { SITE, bearingToWorld } from '../config/site';
import { ASSUMPTIONS } from '../config/assumptions';
import { nearestSegment, SegmentHit, type CurtainLayout, type ThroatGeometry } from './geometry';

/**
 * Natural current field for the reference site.
 *
 * This is a kinematic engineering model, not CFD: a uniform along-shore current
 * vector, slowed near the revetment and with depth, deflected around the intake
 * structure, plus simple sink/source terms for the intake draw, the recovery
 * throat and the release outlet.
 */
export interface Vec2Out {
  x: number;
  z: number;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class FlowField {
  speed = 0.32;
  dirX = 1;
  dirZ = 0;
  /** Transfer flow fraction drawing water into the throat (0..1). */
  throatFlow = 0;
  /** Release jet activity (0..1). */
  releaseJet = 0;
  throat: ThroatGeometry | null = null;

  setCurrent(speed: number, bearingDeg: number): void {
    const d = bearingToWorld(bearingDeg);
    this.speed = speed;
    this.dirX = d.x;
    this.dirZ = d.z;
  }

  /** Effective angle (degrees) between a curtain heading `angleDeg` and the current direction. */
  attackAngle(angleDeg: number, bearingDeg: number): number {
    return angleDeg + (bearingDeg - SITE.bearingOfPlusX);
  }

  /** Ambient current at (x, z) and depth (m). */
  sample(x: number, z: number, depth: number, out: Vec2Out): void {
    const sh = SITE.shore;
    const intake = SITE.intake;
    let f = 0.35 + 0.65 * smoothstep(sh.toeZ, sh.toeZ + 22, z);
    f *= 1 - 0.2 * Math.min(depth / 8, 1);
    let ux = this.dirX * this.speed * f;
    let uz = this.dirZ * this.speed * f;

    // Flow is turned offshore ahead of the intake structure's upstream wall.
    if (x < intake.x0 + 1 && x > intake.x0 - 30 && z < intake.mouthZ + 10) {
      const w = smoothstep(intake.x0 - 30, intake.x0 - 1, x) * (1 - smoothstep(intake.mouthZ - 2, intake.mouthZ + 10, z));
      const turn = 0.85 * w;
      uz += Math.abs(ux) * turn;
      ux *= 1 - turn;
    }

    // Intake draw toward the screen face.
    const s = SITE.intakeSuction;
    const insideStructure = x > intake.x0 && x < intake.x1 && z < intake.mouthZ;
    if (!insideStructure) {
      const cx = x < intake.x0 ? intake.x0 : x > intake.x1 ? intake.x1 : x;
      const dx = cx - x;
      const dz = intake.mouthZ - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < s.range && d > 1e-3) {
        const v = ((s.v0 * s.r0) / (s.r0 + d)) * (1 - smoothstep(s.range * 0.6, s.range, d));
        ux += (dx / d) * v;
        uz += (dz / d) * v;
      }
    }

    // Recovery throat draw (only while transfer flow runs).
    const th = this.throat;
    if (th && this.throatFlow > 0) {
      const dx = th.inletX - x;
      const dz = th.inletZ - z;
      const dmx = th.mx - x;
      const dmz = th.mz - z;
      const dm = Math.sqrt(dmx * dmx + dmz * dmz);
      if (dm < 10) {
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const v = 0.22 * this.throatFlow * (1 - dm / 10) * (1 - dm / 10);
        ux += (dx / d) * v;
        uz += (dz / d) * v;
      }
    }

    // Release outlet jet.
    if (this.releaseJet > 0) {
      const r = SITE.release;
      const dx = x - r.x;
      const dz = z - r.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 16) {
        const v = ASSUMPTIONS.release.jetSpeed * this.releaseJet * (1 - d / 16) * (1 - d / 16);
        ux += r.dirX * v;
        uz += r.dirZ * v;
      }
    }

    out.x = ux;
    out.z = uz;
  }
}

const hit = new SegmentHit();

/**
 * Surface-flow deflection by the curtain, used for the flow visualisation.
 * Mirrors the agent interaction model: the normal component is blocked and
 * partly redirected along the curtain; the lee is sheltered.
 * Returns the signed distance to the curtain face (Infinity if not near).
 */
export function deflectByCurtain(
  L: CurtainLayout,
  segActive: Uint8Array,
  x: number,
  z: number,
  v: Vec2Out,
): number {
  if (!nearestSegment(L, x, z, hit)) return Infinity;
  const k = hit.seg;
  if (!segActive[k] || !hit.within) return Infinity;
  const d = hit.d;
  const nx = L.nx[k];
  const nz = L.nz[k];
  if (d > 0 && d < 6) {
    const g = 1 - d / 6;
    const gs = g * g * (3 - 2 * g);
    const vin = -(v.x * nx + v.z * nz);
    if (vin > 0) {
      v.x += nx * vin * gs + L.tx[k] * vin * gs * 0.8;
      v.z += nz * vin * gs + L.tz[k] * vin * gs * 0.8;
    }
  } else if (d <= 0 && d > -12) {
    const shelter = 0.55 * (1 + d / 12);
    v.x *= 1 - shelter;
    v.z *= 1 - shelter;
  }
  return d;
}
