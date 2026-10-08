import { ASSUMPTIONS } from '../config/assumptions';
import { seabedDepth } from '../config/site';
import { waveElevation } from './waves';
import type { CurtainLayout } from './geometry';
import type { CurtainMode, DeployMode, SimParams } from './types';

const C = ASSUMPTIONS.curtain;
const D = ASSUMPTIONS.deploy;

/** Seabed depth under each segment's midpoint (m). */
function floorDepths(layout: CurtainLayout): Float32Array {
  const out = new Float32Array(layout.segCount);
  for (let k = 0; k < layout.segCount; k++) out[k] = Math.max(0.5, seabedDepth(layout.midX[k], layout.midZ[k]));
  return out;
}

/**
 * Seconds from a pop-up deployment command until segment k has surfaced: valve checks, the
 * inflation front running from the throat end to the segment, and the segment's ascent.
 */
export function popUpSurfaceTime(layout: CurtainLayout, k: number): number {
  const s = layout.s0[k] + layout.len[k] * 0.5;
  return D.popUpDelay + (layout.length - s) / D.popUpSpeed + seabedDepth(layout.midX[k], layout.midZ[k]) / D.riseSpeed;
}

/** Bloom depth (m) that 90 % of the bloom is shallower than. */
export function bloomP90(params: Pick<SimParams, 'bloomMeanDepth' | 'bloomDepthSD'>): number {
  return params.bloomMeanDepth + 1.2816 * params.bloomDepthSD;
}

/**
 * Skirt depth the winches hold: the operator setpoint, lowered automatically while the bloom's
 * P90 depth is below it (see `adaptiveSkirtMargin`), never past the seabed clearance limit.
 */
export function skirtSetpoint(params: SimParams, maxSkirt: number): number {
  const setpoint = Math.min(params.skirtDepth, maxSkirt);
  const p90 = bloomP90(params);
  if (p90 <= setpoint) return setpoint;
  return Math.min(maxSkirt, Math.ceil((p90 + C.adaptiveSkirtMargin) * 10) / 10);
}

/** Seconds from a pop-up deployment command until every section has surfaced. */
export function popUpDuration(layout: CurtainLayout): number {
  let t = 0;
  for (let k = 0; k < layout.segCount; k++) t = Math.max(t, popUpSurfaceTime(layout, k));
  return t;
}

/**
 * Physical state of the SweepLine guide curtain.
 *
 * Deployment works from the recovery throat toward the prepared upstream anchor.
 * A pop-up curtain lies stowed on the seabed; after the valve checks an inflation
 * front runs along its float line and each inflated section rises through the
 * water column at a finite speed, its skirt hanging beneath it, and only guides
 * once it is at the surface. A workboat instead lays it from the throat-side reel.
 * Reefing always starts at the UPSTREAM end, so new bloom traffic stops entering
 * first while traffic already on the curtain continues to the throat. The
 * built-in water jets run on every guiding segment.
 */
export class CurtainState {
  layout: CurtainLayout;
  mode: CurtainMode = 'STOWED';
  /** Metres laid, measured from the throat end (may overshoot to finish the skirt drop). */
  deployFront = 0;
  /** Metres reefed, measured from the upstream end. */
  reefFront = 0;
  /** Reef front speed (m/s), commanded by the SafeOpen controller. */
  reefSpeed = 0;
  /** How the current (or next) deployment is carried out. */
  deployMode: DeployMode = 'popup';
  /** Seconds left before the deployment front starts moving (valve checks or vessel mobilisation). */
  deployDelay = 0;
  private deployRate: number = D.popUpSpeed;
  /** Commanded jet output (0..1) and the ramped output actually delivered. */
  jetTarget = 0;
  jetOutput = 0;
  skirtActual: number;
  skirtTarget: number;

  /** Effective skirt depth per segment below still water (m); 0 where not guiding. */
  segSkirt: Float32Array;
  /** 1 where the segment is guiding. */
  segActive: Uint8Array;
  /** 1 where the segment is inside a reef transition (released traffic counts as reef release). */
  segReefing: Uint8Array;
  /** Skirt depth fraction 0..1 per segment (for rendering). */
  segDrop: Float32Array;
  /** Float-line height per segment: 0 lying on the seabed (stowed), 1 at the surface. */
  segRise: Float32Array;
  /** Seabed depth under each segment (m). */
  private segFloor: Float32Array;
  /** Length-weighted mean rise: 0 stowed on the seabed, 1 with every section at the surface. */
  meanRise = 0;
  activeCount = 0;
  /** Normal component of the current against the curtain (m/s). */
  normalVelocity = 0;
  /** Blow-back factor cos(theta) applied to the skirt depth. */
  liftCos = 1;
  liftAngleDeg = 0;

  constructor(layout: CurtainLayout, skirt: number) {
    this.layout = layout;
    this.skirtActual = skirt;
    this.skirtTarget = skirt;
    this.segSkirt = new Float32Array(layout.segCount);
    this.segActive = new Uint8Array(layout.segCount);
    this.segReefing = new Uint8Array(layout.segCount);
    this.segDrop = new Float32Array(layout.segCount);
    this.segRise = new Float32Array(layout.segCount);
    this.segFloor = floorDepths(layout);
  }

  setLayout(layout: CurtainLayout): boolean {
    if (this.mode !== 'STOWED') return false;
    this.layout = layout;
    this.segSkirt = new Float32Array(layout.segCount);
    this.segActive = new Uint8Array(layout.segCount);
    this.segReefing = new Uint8Array(layout.segCount);
    this.segDrop = new Float32Array(layout.segCount);
    this.segRise = new Float32Array(layout.segCount);
    this.segFloor = floorDepths(layout);
    return true;
  }

  get length(): number {
    return this.layout.length;
  }

  /** Maximum skirt depth permitted by the seabed-clearance rule on this layout. */
  get clearanceLimitedMax(): number {
    return Math.min(C.skirtDepthMax, this.layout.minSeabedDepth - C.seabedClearance);
  }

  /** Fraction of the curtain deployed: risen (pop-up) or laid on the water (workboat). */
  get deployedFraction(): number {
    return this.deployMode === 'popup' ? this.meanRise : Math.min(1, this.deployFront / this.layout.length);
  }

  /** Fraction of the curtain reefed. */
  get reefedFraction(): number {
    return Math.min(1, this.reefFront / this.layout.length);
  }

  /** Arc position of the workboat / laying point. */
  get layingPoint(): number {
    return Math.max(0, this.layout.length - this.deployFront);
  }

  deploy(mode: DeployMode = 'popup'): boolean {
    if (this.mode !== 'STOWED') return false;
    this.mode = 'DEPLOYING';
    this.deployMode = mode;
    this.deployDelay = mode === 'popup' ? D.popUpDelay : D.workboatMobilisation;
    this.deployRate = mode === 'popup' ? D.popUpSpeed : C.deploySpeed;
    this.deployFront = 0;
    this.reefFront = 0;
    return true;
  }

  beginReef(): boolean {
    if (this.mode !== 'DEPLOYED' && this.mode !== 'DEPLOYING' && this.mode !== 'UNREEFING') return false;
    if (this.mode === 'DEPLOYING') this.deployFront = Math.min(this.deployFront, this.layout.length);
    this.mode = 'REEFING';
    this.reefSpeed = 0;
    return true;
  }

  /** Re-engage a reefed curtain from the downstream end back toward the upstream anchor. */
  unreef(): boolean {
    if (this.mode !== 'REEFED' && this.mode !== 'REEFING') return false;
    this.mode = 'UNREEFING';
    this.reefFront = Math.min(this.reefFront, this.layout.length + C.reefBand);
    return true;
  }

  stow(): boolean {
    if (this.mode === 'STOWED' || this.mode === 'STOWING') return false;
    this.mode = 'STOWING';
    this.deployFront = Math.min(this.deployFront, this.layout.length);
    return true;
  }

  update(dt: number, env: { normalVelocity: number; waveHeight: number; time: number }): void {
    const L = this.layout.length;
    switch (this.mode) {
      case 'DEPLOYING':
        if (this.deployDelay > 0) {
          this.deployDelay = Math.max(0, this.deployDelay - dt);
          break;
        }
        if (this.deployMode === 'popup') {
          // Deployed once the inflation front has reached the anchor and every section has surfaced.
          this.deployFront = Math.min(L, this.deployFront + this.deployRate * dt);
          if (this.deployFront >= L && this.meanRise >= 1) this.mode = 'DEPLOYED';
        } else {
          this.deployFront += this.deployRate * dt;
          if (this.deployFront >= L + C.skirtDropLag + 3) {
            this.deployFront = L;
            this.mode = 'DEPLOYED';
          }
        }
        break;
      case 'REEFING':
        this.reefFront = Math.min(L + C.reefBand, this.reefFront + this.reefSpeed * dt);
        if (this.reefFront >= L + C.reefBand) this.mode = 'REEFED';
        break;
      case 'UNREEFING':
        this.reefFront = Math.max(0, this.reefFront - ASSUMPTIONS.safeOpen.rearmSpeed * dt);
        if (this.reefFront <= 0) this.mode = 'DEPLOYED';
        break;
      case 'STOWING':
        this.deployFront = Math.max(0, this.deployFront - C.stowSpeed * dt);
        // A pop-up curtain is stowed once every vented section has settled back on the seabed.
        if (this.deployFront <= 0 && (this.deployMode !== 'popup' || this.meanRise <= 0)) {
          this.mode = 'STOWED';
          this.reefFront = 0;
        }
        break;
      default:
        break;
    }

    // Reefing winches move the skirt toward its setpoint, limited by seabed clearance.
    const target = Math.min(this.skirtTarget, this.clearanceLimitedMax);
    const diff = target - this.skirtActual;
    const stepMax = C.skirtWinchRate * dt;
    this.skirtActual += Math.abs(diff) <= stepMax ? diff : Math.sign(diff) * stepMax;

    // Skirt blow-back under the normal current component.
    this.normalVelocity = env.normalVelocity;
    const theta = Math.atan(C.liftCoefficient * env.normalVelocity * env.normalVelocity);
    this.liftCos = Math.cos(theta);
    this.liftAngleDeg = (theta * 180) / Math.PI;

    const lay = this.layout;
    const laidFrom = L - this.deployFront;
    const stowed = this.mode === 'STOWED';
    const popup = this.deployMode === 'popup';
    const reefing = this.mode === 'REEFING' || this.mode === 'REEFED' || this.mode === 'UNREEFING';
    let active = 0;
    let risen = 0;
    for (let k = 0; k < lay.segCount; k++) {
      const s = lay.s0[k] + lay.len[k] * 0.5;
      const laid = !stowed && s >= laidFrom;
      // Pop-up sections rise (or, vented, sink) at a finite speed; a workboat lays them at the surface.
      let rise = laid ? 1 : 0;
      if (popup) {
        rise = this.segRise[k];
        const goal = laid ? 1 : 0;
        const step = ((goal > rise ? D.riseSpeed : D.sinkSpeed) * dt) / this.segFloor[k];
        rise = Math.abs(goal - rise) <= step ? goal : rise + Math.sign(goal - rise) * step;
      }
      this.segRise[k] = rise;
      risen += rise * lay.len[k];
      // A section guides only with its float line at the surface.
      if (!laid || rise < 1) {
        this.segSkirt[k] = 0;
        this.segActive[k] = 0;
        this.segReefing[k] = 0;
        this.segDrop[k] = 0;
        continue;
      }
      // A pop-up skirt hangs beneath its float on the way up, so it is at depth on surfacing.
      const drop = this.mode === 'DEPLOYING' && !popup ? Math.min(1, Math.max(0, (s - laidFrom - 3) / C.skirtDropLag)) : 1;
      const reef = reefing ? Math.min(1, Math.max(0, (s - this.reefFront) / C.reefBand)) : 1;
      const frac = drop * reef;
      this.segDrop[k] = frac;
      const eta = waveElevation(lay.midX[k], lay.midZ[k], env.time, env.waveHeight);
      const depth = this.skirtActual * frac * this.liftCos;
      this.segSkirt[k] = Math.max(0, depth - C.relativeHeave * eta);
      const on = frac > 0.35 ? 1 : 0;
      this.segActive[k] = on;
      this.segReefing[k] = reefing && reef < 1 ? 1 : 0;
      active += on;
    }
    this.activeCount = active;
    this.meanRise = Math.min(1, risen / L);

    // Jets ramp toward the commanded output while any segment is guiding.
    const jetGoal = active > 0 ? this.jetTarget : 0;
    const jetStep = dt / ASSUMPTIONS.jets.rampTime;
    const jd = jetGoal - this.jetOutput;
    this.jetOutput += Math.abs(jd) <= jetStep ? jd : Math.sign(jd) * jetStep;
  }

  /** Float-line rise of the segment at arc position s. */
  riseAt(s: number): number {
    const lay = this.layout;
    let lo = 0;
    let hi = lay.segCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lay.s0[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return this.segRise[lo];
  }

  /** Minimum skirt–seabed clearance along the curtain for the current setpoint (m). */
  seabedClearance(): number {
    let minClear = Infinity;
    const lay = this.layout;
    for (let k = 0; k < lay.segCount; k += 4) {
      minClear = Math.min(minClear, seabedDepth(lay.midX[k], lay.midZ[k]) - this.skirtTarget);
    }
    return minClear;
  }
}
