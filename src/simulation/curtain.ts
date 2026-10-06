import { ASSUMPTIONS } from '../config/assumptions';
import { seabedDepth } from '../config/site';
import { waveElevation } from './waves';
import type { CurtainLayout } from './geometry';
import type { CurtainMode, DeployMode } from './types';

const C = ASSUMPTIONS.curtain;
const D = ASSUMPTIONS.deploy;

/**
 * Physical state of the SweepLine guide curtain.
 *
 * Deployment works from the recovery throat toward the prepared upstream anchor:
 * a pop-up curtain rises from the seabed as its float line inflates, or a
 * workboat lays it from the throat-side reel. Reefing always starts at the
 * UPSTREAM end, so new bloom traffic stops entering first while traffic already
 * on the curtain continues to the throat. The built-in water jets run on every
 * guiding segment.
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
  }

  setLayout(layout: CurtainLayout): boolean {
    if (this.mode !== 'STOWED') return false;
    this.layout = layout;
    this.segSkirt = new Float32Array(layout.segCount);
    this.segActive = new Uint8Array(layout.segCount);
    this.segReefing = new Uint8Array(layout.segCount);
    this.segDrop = new Float32Array(layout.segCount);
    return true;
  }

  get length(): number {
    return this.layout.length;
  }

  /** Maximum skirt depth permitted by the seabed-clearance rule on this layout. */
  get clearanceLimitedMax(): number {
    return Math.min(C.skirtDepthMax, this.layout.minSeabedDepth - C.seabedClearance);
  }

  /** Fraction of the curtain laid on the water. */
  get deployedFraction(): number {
    return Math.min(1, this.deployFront / this.layout.length);
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
        this.deployFront += this.deployRate * dt;
        if (this.deployFront >= L + C.skirtDropLag + 3) {
          this.deployFront = L;
          this.mode = 'DEPLOYED';
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
        if (this.deployFront <= 0) {
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
    const reefing = this.mode === 'REEFING' || this.mode === 'REEFED' || this.mode === 'UNREEFING';
    let active = 0;
    for (let k = 0; k < lay.segCount; k++) {
      const s = lay.s0[k] + lay.len[k] * 0.5;
      if (stowed || s < laidFrom) {
        this.segSkirt[k] = 0;
        this.segActive[k] = 0;
        this.segReefing[k] = 0;
        this.segDrop[k] = 0;
        continue;
      }
      const drop = this.mode === 'DEPLOYING' ? Math.min(1, Math.max(0, (s - laidFrom - 3) / C.skirtDropLag)) : 1;
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

    // Jets ramp toward the commanded output while any segment is guiding.
    const jetGoal = active > 0 ? this.jetTarget : 0;
    const jetStep = dt / ASSUMPTIONS.jets.rampTime;
    const jd = jetGoal - this.jetOutput;
    this.jetOutput += Math.abs(jd) <= jetStep ? jd : Math.sign(jd) * jetStep;
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
