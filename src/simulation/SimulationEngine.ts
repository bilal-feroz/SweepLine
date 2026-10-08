import { SITE, seabedDepth } from '../config/site';
import { ASSUMPTIONS } from '../config/assumptions';
import {
  AgentPool,
  F_DIVERTED,
  F_ENCOUNTERED,
  F_OVERTOPPED,
  F_OVERTOPPING,
  F_REEF_RELEASED,
  F_RESOLVED,
  F_UNDER_COUNTED,
  STATE_NAMES,
  S_APPROACHING,
  S_FREE_DRIFT,
  S_GUIDED,
  S_INACTIVE,
  S_INTAKE_CONTACT,
  S_RELEASED,
  S_TRANSFERRED,
  S_TRANSFER_QUEUE,
  S_UNDER_SKIRT,
} from './Agent';
import { CurtainState, popUpSurfaceTime, skirtSetpoint } from './curtain';
import { FlowField } from './flowField';
import {
  curtainXAt,
  getCurtainLayout,
  nearestSegment,
  SegmentHit,
  throatHalfHeightAt,
  throatHalfWidthAt,
  type CurtainLayout,
} from './geometry';
import { fbm1, hash01, SeededRandom, valueNoise } from './seededRandom';
import { TransferState } from './transfer';
import type { EngineKind, SimParams } from './types';

const DEG = Math.PI / 180;

export interface Counters {
  spawned: number;
  dropped: number;
  /** Agents that reached the intake screens. */
  intakeContacts: number;
  /** Agents that passed the intake reference line (or left the site) without contact or diversion. */
  exited: number;
  /** Agents that interacted with SweepLine (curtain or throat). */
  encountered: number;
  /** Agents that reached the recovery throat. */
  diverted: number;
  underSkirt: number;
  overtopped: number;
  /** Agents released from the curtain by reefing (SafeOpen) — dispersed, not diverted. */
  reefReleased: number;
  transferred: number;
  released: number;
  contactTimeSum: number;
  contactTimeN: number;
}

export type MarkerKind = 'under' | 'overtop' | 'intake' | 'release';

export interface Marker {
  x: number;
  y: number;
  z: number;
  t: number;
  kind: MarkerKind;
}

export interface AgentInfo {
  id: number;
  slot: number;
  state: (typeof STATE_NAMES)[number];
  depth: number;
  speed: number;
  x: number;
  z: number;
  size: number;
  contactTime: number | null;
  transitRemaining: number | null;
}

const zeroCounters = (): Counters => ({
  spawned: 0,
  dropped: 0,
  intakeContacts: 0,
  exited: 0,
  encountered: 0,
  diverted: 0,
  underSkirt: 0,
  overtopped: 0,
  reefReleased: 0,
  transferred: 0,
  released: 0,
  contactTimeSum: 0,
  contactTimeN: 0,
});

const MARKER_CAPACITY = 128;

/**
 * Agent-based engineering simulation of one world (baseline or SweepLine).
 * Agent-based engineering simulation — not validated field performance.
 */
export class SimulationEngine {
  readonly kind: EngineKind;
  params: SimParams;
  pool: AgentPool;
  rng: SeededRandom;
  readonly flow = new FlowField();
  curtain: CurtainState | null = null;
  transfer: TransferState | null = null;
  counters: Counters = zeroCounters();
  time = 0;
  bloomActive = true;
  /** Additional debris / bio-fouling load (fraction of design) — failure injection. */
  debrisLoad = 0;
  debrisTarget = 0;
  /** Smoothed curtain load as a fraction of design (1 = 100 %). */
  curtainLoad = 0;
  guidedCount = 0;
  backedUpCount = 0;
  underSkirtNow = 0;
  holdCapacity = 20;
  /** Releases per second (EMA). */
  releaseEMA = 0;

  readonly markers: Marker[] = [];
  markerSeq = 0;
  /** Sim times of recent intake contacts (for rolling rates). */
  intakeTimes: number[] = [];

  private spawnAcc = 0;
  private nextId = 1;
  private arrivalsThisStep = 0;
  private releasesThisStep = 0;
  private readonly tmp = { x: 0, z: 0 };
  private readonly hit = new SegmentHit();
  private readonly arc = { x: 0, z: 0, nx: 0, nz: 0 };

  constructor(kind: EngineKind, params: SimParams) {
    this.kind = kind;
    this.params = { ...params };
    this.pool = new AgentPool(SimulationEngine.poolSize(params.agentBudget));
    this.rng = new SeededRandom(params.seed);
    this.reset(params, 'none');
  }

  static poolSize(budget: number): number {
    return Math.ceil(budget * 2.6) + 64;
  }

  get layout(): CurtainLayout | null {
    return this.curtain ? this.curtain.layout : null;
  }

  reset(params: SimParams, fill: 'approach' | 'none'): void {
    this.params = { ...params };
    const need = SimulationEngine.poolSize(params.agentBudget);
    if (this.pool.capacity !== need) this.pool = new AgentPool(need);
    else this.pool.clear();
    this.rng = new SeededRandom(params.seed);
    this.counters = zeroCounters();
    this.time = 0;
    this.spawnAcc = 0;
    this.nextId = 1;
    this.bloomActive = true;
    this.debrisLoad = 0;
    this.debrisTarget = 0;
    this.curtainLoad = 0;
    this.guidedCount = 0;
    this.backedUpCount = 0;
    this.releaseEMA = 0;
    this.intakeTimes = [];
    this.markers.length = 0;
    this.markerSeq = 0;
    this.holdCapacity = Math.max(6, Math.round((ASSUMPTIONS.throat.holdCapacityPerThousand * params.agentBudget) / 1000));
    this.flow.setCurrent(params.currentSpeed, params.currentBearing);
    this.flow.throatFlow = 0;
    this.flow.releaseJet = 0;

    if (this.kind === 'sweepline') {
      const layout = getCurtainLayout(params.anchorAngle);
      this.curtain = new CurtainState(layout, params.skirtDepth);
      this.transfer = new TransferState();
      this.flow.throat = layout.throat;
    } else {
      this.curtain = null;
      this.transfer = null;
      this.flow.throat = null;
    }
    this.applyParams(params);
    if (fill === 'approach') this.initialFill();
  }

  /** Apply live parameter changes (anchor angle only takes effect while stowed). */
  applyParams(params: SimParams): void {
    this.params = { ...params };
    this.flow.setCurrent(params.currentSpeed, params.currentBearing);
    if (this.curtain) {
      this.curtain.jetTarget = params.activeFlow ? Math.min(1, Math.max(0, params.jetLevel)) : 0;
      if (this.curtain.layout.angle !== params.anchorAngle && this.curtain.mode === 'STOWED') {
        const layout = getCurtainLayout(params.anchorAngle);
        this.curtain.setLayout(layout);
        this.flow.throat = layout.throat;
      }
      this.curtain.skirtTarget = skirtSetpoint(params, this.curtain.clearanceLimitedMax);
      // A stowed pop-up curtain lies on the seabed; a workboat curtain is stowed aboard.
      if (this.curtain.mode === 'STOWED') this.curtain.deployMode = params.deployMode;
    }
    if (this.transfer) {
      this.transfer.capacityFraction = params.transferCapacity;
      this.transfer.standbyEnabled = params.standbyEnabled;
      this.transfer.designRate = (ASSUMPTIONS.transfer.designRatePerThousand * params.agentBudget) / 1000;
    }
  }

  // ---------------------------------------------------------------- spawning

  /** Bloom arrival rate (agents/s): density × budget held over the traverse, × flux (current speed). */
  spawnRate(): number {
    const P = this.params;
    const U = Math.max(0.05, P.currentSpeed);
    const base = (P.bloomDensity * P.agentBudget * U) / SITE.spawn.traverseLength;
    const v = ASSUMPTIONS.bloom.rateVariation * (2 * fbm1(P.seed * 13 + 5, this.time / 120) - 1);
    return Math.max(0, base * (1 + v));
  }

  private patchCenter(): number {
    const w = ASSUMPTIONS.bloom.patchWander;
    return SITE.spawn.zCenter + w * (2 * fbm1(this.params.seed * 7 + 3, this.time / 300) - 1);
  }

  /** Cross-shore position of a new agent (mostly the main patch, the rest a broad background), folded into the spawn band. */
  private lateralZ(u1: number, u2: number, n1: number, zOverride: number | null): number {
    const sp = SITE.spawn;
    let z: number;
    if (zOverride !== null) z = zOverride;
    else if (u1 < ASSUMPTIONS.bloom.mainPatchFraction) z = this.patchCenter() + n1 * sp.zSigma;
    else z = sp.zMin + u2 * (sp.zMax - sp.zMin);
    if (z < sp.zMin) z = Math.min(sp.zMax, 2 * sp.zMin - z);
    if (z > sp.zMax) z = sp.zMax - (z - sp.zMax) * 0.5;
    return z;
  }

  /** The bloom already on its way when a run starts, from the spawn line up to its leading edge. */
  private initialFill(): void {
    const B = ASSUMPTIONS.bloom;
    const span = this.bloomStartX() - B.approachFillFrom;
    const U = Math.max(0.05, this.params.currentSpeed);
    const count = Math.round((this.spawnRate() * span) / (U * 0.85));
    for (let i = 0; i < count; i++) {
      const x = B.approachFillFrom + this.rng.next() * span;
      this.spawnOne(x, null);
    }
    // Ahead of a bloom timed to a pop-up deployment, its ragged leading edge (see `leadingScatter`).
    if (this.params.deployMode === 'popup' && this.params.autoDeploy) {
      const S = B.leadingScatter;
      const layout = getCurtainLayout(this.params.anchorAngle);
      for (let i = 0; i < S.count; i++) {
        const z = S.zMin + this.rng.next() * (S.zMax - S.zMin);
        const x = curtainXAt(layout, z) - (S.leadMin + this.rng.next() * (S.leadMax - S.leadMin));
        this.spawnOne(x, z);
      }
    }
  }

  /**
   * Leading edge (x) of the bloom when a run starts. With an automatic pop-up deployment it lies
   * just upstream of the curtain's upstream anchor: set back from every section by the drift until
   * that section has surfaced (early warning, deployment confirmation and its pop-up time, at the
   * local drift speed — slower near the revetment — plus the fastest swimming, × popUpFrontMargin,
   * plus popUpFrontGap), so the curtain is up before the bloom reaches it. Otherwise (workboat or
   * manual deployment) upstream of every anchor layout. Computed from the parameters only, so both
   * engines place the same bloom.
   */
  bloomStartX(): number {
    const B = ASSUMPTIONS.bloom;
    if (this.params.deployMode !== 'popup' || !this.params.autoDeploy) return B.approachFillTo;
    const S = ASSUMPTIONS.sequence;
    const layout = getCurtainLayout(this.params.anchorAngle);
    const v = this.tmp;
    let front = Infinity;
    for (let k = 0; k < layout.segCount; k++) {
      const x = Math.min(layout.px[k], layout.px[k + 1]);
      this.flow.sample(x, layout.midZ[k], this.params.bloomMeanDepth, v);
      const drift = Math.max(0, v.x) + ASSUMPTIONS.agent.swimSpeedMax;
      const lead = drift * (S.warningAt + S.deployConfirm + popUpSurfaceTime(layout, k)) * B.popUpFrontMargin + B.popUpFrontGap;
      front = Math.min(front, x - lead);
    }
    return Math.max(B.approachFillFrom + 20, front);
  }

  /**
   * Leading edge (x by lateral position) for a bloom surge: just upstream of a guiding curtain,
   * so it reaches the curtain within moments, otherwise where a run's bloom starts.
   */
  surgeEdge(): (z: number) => number {
    const c = this.curtain;
    if (c && (c.mode === 'DEPLOYED' || c.mode === 'UNREEFING')) {
      const L = c.layout;
      return (z) => curtainXAt(L, z) - ASSUMPTIONS.bloom.surgeGap;
    }
    const x = this.bloomStartX();
    return () => x;
  }

  /** Spawn a concentrated bloom surge (stress test: high bloom density) in a band behind `edge`; it fades in. */
  spawnSurge(count: number, edge: (z: number) => number): void {
    const B = ASSUMPTIONS.bloom;
    for (let i = 0; i < count; i++) {
      const z = this.lateralZ(0, 0, 0, this.patchCenter() + (this.rng.next() - 0.5) * 50);
      this.spawnOne(edge(z) - this.rng.next() * B.surgeDepth, z, false);
    }
  }

  /**
   * Spawn one agent (`visible`: drawn at once rather than fading in). Always consumes the same
   * number of random draws so the baseline and SweepLine engines stay synchronised.
   */
  private spawnOne(xOverride: number | null, zOverride: number | null, visible = xOverride !== null): void {
    const r = this.rng;
    const u1 = r.next();
    const u2 = r.next();
    const u3 = r.next();
    const u4 = r.next();
    const u5 = r.next();
    const u6 = r.next();
    const u7 = r.next();
    const u8 = r.next();
    const n1 = r.normal();
    const n2 = r.normal();
    const agentId = this.nextId++;
    this.counters.spawned++;

    const sp = SITE.spawn;
    const z = this.lateralZ(u1, u2, n1, zOverride);
    const x = xOverride !== null ? xOverride : sp.x - u3 * sp.jitterX;

    const slot = this.pool.alloc();
    if (slot < 0) {
      this.counters.dropped++;
      return;
    }
    const A = ASSUMPTIONS.agent;
    const P = this.params;
    const p = this.pool;
    const seabed = seabedDepth(x, z);
    let pref = P.bloomMeanDepth + P.bloomDepthSD * n2;
    pref = Math.min(Math.max(pref, A.minDepth), seabed - 0.8);

    p.id[slot] = agentId;
    p.state[slot] = S_APPROACHING;
    p.flags[slot] = 0;
    p.side[slot] = 0;
    p.px[slot] = x;
    p.py[slot] = -pref;
    p.pz[slot] = z;
    this.flow.sample(x, z, pref, this.tmp);
    p.vx[slot] = this.tmp.x;
    p.vy[slot] = 0;
    p.vz[slot] = this.tmp.z;
    p.size[slot] = A.bellDiameterMin + u4 * (A.bellDiameterMax - A.bellDiameterMin);
    p.phase[slot] = u5;
    p.tint[slot] = u6;
    p.depthZ[slot] = n2;
    p.swimSpeed[slot] = A.swimSpeedMin + u7 * (A.swimSpeedMax - A.swimSpeedMin);
    p.heading[slot] = (u8 - 0.5) * Math.PI * 2;
    p.stateTime[slot] = 0;
    p.contactStart[slot] = -1;
    p.timer[slot] = 0;
    p.queueIndex[slot] = -1;
    p.fade[slot] = visible ? 1 : 0;
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.time += dt;
    const P = this.params;
    this.arrivalsThisStep = 0;
    this.releasesThisStep = 0;

    if (this.curtain) {
      const attack = this.flow.attackAngle(this.curtain.layout.angle, P.currentBearing);
      const un = P.currentSpeed * Math.sin(Math.max(0, attack) * DEG);
      this.curtain.update(dt, { normalVelocity: un, waveHeight: P.waveHeight, time: this.time });
    }
    if (this.transfer) {
      this.transfer.update(dt);
      this.flow.throatFlow = this.transfer.throatOpen ? this.transfer.availability() : 0;
    }
    this.flow.releaseJet = Math.min(1, this.releaseEMA * 12);

    if (this.bloomActive) {
      this.spawnAcc += this.spawnRate() * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnOne(null, null);
      }
    }

    this.updateAgents(dt);
    if (this.transfer) this.processTransfer(dt);

    const a = 1 - Math.exp(-dt / 45);
    if (this.transfer) this.transfer.arrivalEMA += (this.arrivalsThisStep / dt - this.transfer.arrivalEMA) * a;
    this.releaseEMA += (this.releasesThisStep / dt - this.releaseEMA) * (1 - Math.exp(-dt / 20));
    this.updateLoad(dt);
    this.pruneIntakeTimes();
  }

  private updateAgents(dt: number): void {
    const pool = this.pool;
    const { state, flags, side, px, py, pz, vx, vy, vz, id, depthZ, swimSpeed, heading, stateTime, contactStart, timer, fade } =
      pool;
    const P = this.params;
    const A = ASSUMPTIONS.agent;
    const CA = ASSUMPTIONS.curtain;
    const t = this.time;
    const relax = 1 - Math.exp(-dt / A.tau);
    const curtain = this.curtain;
    const layout = curtain ? curtain.layout : null;
    const curtainLive = !!curtain && curtain.activeCount > 0;
    const transfer = this.transfer;
    const throatOpen = !!transfer && transfer.throatOpen && transfer.acceptingNew;
    const th = layout ? layout.throat : null;
    const flow = this.flow;
    const tmp = this.tmp;
    const hit = this.hit;
    const dom = SITE.domain;
    const intake = SITE.intake;
    const passLineX = intake.x1 + 15;
    const counters = this.counters;
    const mean = P.bloomMeanDepth;
    const sd = P.bloomDepthSD;
    const overtopRate =
      P.waveHeight > CA.overtopThreshold ? CA.overtopGain * (P.waveHeight - CA.overtopThreshold) ** 2 : 0;
    const reefingCurtain = !!curtain && (curtain.mode === 'REEFING' || curtain.mode === 'REEFED');
    // Active flow: conveyor wall jet along the bloom face and upward foot jets at the skirt edge.
    const J = ASSUMPTIONS.jets;
    const jet = curtain ? curtain.jetOutput : 0;
    const conveyor = jet * J.conveyorSpeed;
    const uplift = jet * J.footUplift;
    let guided = 0;
    let underNow = 0;
    this.backedUpCount = 0;

    for (let i = 0; i < pool.capacity; i++) {
      const st = state[i];
      if (st === S_INACTIVE) continue;
      if (fade[i] < 1) fade[i] = Math.min(1, fade[i] + dt * 0.25);

      if (st === S_TRANSFERRED) {
        timer[i] -= dt;
        if (timer[i] <= 0) this.releaseAgent(i);
        continue;
      }
      if (st === S_INTAKE_CONTACT) {
        timer[i] -= dt;
        if (timer[i] <= 0) pool.free(i);
        continue;
      }
      stateTime[i] += dt;
      if (st === S_TRANSFER_QUEUE && layout) {
        this.queueDynamics(i, dt, relax, layout);
        continue;
      }

      let x = px[i];
      let z = pz[i];
      let depth = -py[i];
      const aid = id[i];

      flow.sample(x, z, depth, tmp);
      let dvx = tmp.x;
      let dvz = tmp.z;

      // Self-propulsion: slow heading wander modulated by bell pulsation.
      const hd = heading[i] + (valueNoise(aid * 3 + 1, t * 0.05) - 0.5) * 0.8 * dt;
      heading[i] = hd;
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1 + pool.phase[i] * 6.283));
      const sw = swimSpeed[i] * pulse;
      dvx += Math.cos(hd) * sw;
      dvz += Math.sin(hd) * sw;
      // Small-scale stochastic motion.
      dvx += (valueNoise(aid * 5 + 2, t * 0.07) - 0.5) * 2 * A.turbulence;
      dvz += (valueNoise(aid * 5 + 3, t * 0.07) - 0.5) * 2 * A.turbulence;

      // Vertical: swim toward the preferred depth of this individual within the bloom distribution.
      const seabed = seabedDepth(x, z);
      let pref = mean + sd * depthZ[i];
      if (pref < A.minDepth) pref = A.minDepth;
      if (pref > seabed - 0.8) pref = seabed - 0.8;
      let dvy = (depth - pref) * A.verticalGain;
      if (dvy > A.verticalMax) dvy = A.verticalMax;
      else if (dvy < -A.verticalMax) dvy = -A.verticalMax;
      dvy += (valueNoise(aid * 5 + 4, t * 0.05) - 0.5) * 2 * A.verticalNoise;

      let ns = st;
      let guideSeg = -1;
      let fl = flags[i];

      if (fl & F_OVERTOPPING) {
        timer[i] -= dt;
        if (timer[i] <= 0) fl &= ~F_OVERTOPPING;
      }

      // ---------------------------------------------------- curtain interaction
      if (curtainLive && layout && curtain && nearestSegment(layout, x, z, hit) && hit.within && hit.dist < CA.interactionRange + 1) {
        const k = hit.seg;
        const d = hit.d;
        const nX = layout.nx[k];
        const nZ = layout.nz[k];
        const skirt = curtain.segSkirt[k];
        if (curtain.segActive[k] === 0) {
          if (st === S_GUIDED) {
            ns = S_FREE_DRIFT;
            if (reefingCurtain && !(fl & F_REEF_RELEASED)) {
              fl |= F_REEF_RELEASED;
              counters.reefReleased++;
            }
          }
          side[i] = d > 0 ? 1 : -1;
        } else {
          if (jet > 0) {
            if (d > 0 && d < J.conveyorBand && depth < skirt + 0.5) {
              const w0 = 1 - d / J.conveyorBand;
              dvx += layout.tx[k] * conveyor * w0 * w0;
              dvz += layout.tz[k] * conveyor * w0 * w0;
            }
            if (d > -0.5 && d < J.footBand) {
              // Strongest at the hem, fading above it and down to the jets' reach below it.
              const below = depth - skirt;
              const wz = below < 0 ? 1 + below / 0.6 : 1 - below / J.footReach;
              if (wz > 0) dvy += uplift * wz * (1 - Math.abs(d) / J.footBand);
            }
          }
          if (d > 0) {
            if (depth < skirt) {
              if (d < CA.interactionRange) {
                const vin = -(dvx * nX + dvz * nZ);
                const g0 = 1 - d / CA.interactionRange;
                const g = g0 * g0 * (3 - 2 * g0);
                if (vin > 0) {
                  // Normal component is blocked and redirected along the curtain; some becomes downward entrainment.
                  dvx += nX * vin * g + layout.tx[k] * vin * g * CA.redirectGain;
                  dvz += nZ * vin * g + layout.tz[k] * vin * g * CA.redirectGain;
                  dvy -= vin * g * CA.entrainmentGain;
                }
                if (d < CA.guideDistance && !(fl & F_OVERTOPPING)) {
                  if (st !== S_GUIDED) {
                    ns = S_GUIDED;
                    if (!(fl & F_ENCOUNTERED)) {
                      fl |= F_ENCOUNTERED;
                      contactStart[i] = t;
                      counters.encountered++;
                    }
                  }
                  guideSeg = k;
                  // Wave overtopping of the float line by near-surface agents in high sea states.
                  if (overtopRate > 0 && depth < 0.6 && vin > 0) {
                    const p = overtopRate * (vin / 0.1) * dt;
                    if (hash01(aid, Math.floor(t * 10)) < p) {
                      fl |= F_OVERTOPPING | F_OVERTOPPED;
                      timer[i] = 8;
                      ns = S_FREE_DRIFT;
                      guideSeg = -1;
                      counters.overtopped++;
                      this.pushMarker(x, -depth, z, 'overtop');
                    }
                  }
                }
              }
            } else {
              // Deeper than the skirt's lower edge: the agent passes beneath.
              if (d < CA.guideDistance && !(fl & F_ENCOUNTERED)) {
                fl |= F_ENCOUNTERED;
                contactStart[i] = t;
                counters.encountered++;
              }
              if (st === S_GUIDED) ns = S_UNDER_SKIRT;
            }
            side[i] = 1;
          } else {
            let blocked = false;
            if (side[i] === 1 && !(fl & F_OVERTOPPING)) {
              // Crossed the curtain plane during the last step.
              if (depth >= skirt - 0.02) {
                if (curtain.segReefing[k]) {
                  if (!(fl & F_REEF_RELEASED)) {
                    fl |= F_REEF_RELEASED;
                    counters.reefReleased++;
                  }
                } else if (!(fl & F_UNDER_COUNTED)) {
                  fl |= F_UNDER_COUNTED;
                  counters.underSkirt++;
                  this.pushMarker(x, -depth, z, 'under');
                }
                ns = S_UNDER_SKIRT;
              } else {
                // Above the skirt edge the curtain is impermeable: restore to the bloom face.
                x += nX * (CA.minStandoff - d);
                z += nZ * (CA.minStandoff - d);
                blocked = true;
              }
            }
            if (!blocked) side[i] = -1;
            if (ns === S_UNDER_SKIRT && d < -2.5) ns = S_FREE_DRIFT;
          }
        }
      } else if (st === S_GUIDED || st === S_UNDER_SKIRT) {
        ns = S_FREE_DRIFT;
        side[i] = 0;
      } else {
        side[i] = 0;
      }

      // ---------------------------------------------------- recovery throat capture
      if (throatOpen && th && ns !== S_UNDER_SKIRT) {
        const rx = x - th.mx;
        const rz = z - th.mz;
        const q = rx * th.ax + rz * th.az;
        if (q > -0.8 && q < th.length * 0.6) {
          const lat = rx * th.lx + rz * th.lz;
          if (Math.abs(lat) < throatHalfWidthAt(th, q) && depth < th.centerDepth + throatHalfHeightAt(th, q)) {
            flags[i] = fl;
            px[i] = x;
            pz[i] = z;
            this.enqueue(i);
            continue;
          }
        }
      }

      // ---------------------------------------------------- integrate
      vx[i] += (dvx - vx[i]) * relax;
      vy[i] += (dvy - vy[i]) * relax;
      vz[i] += (dvz - vz[i]) * relax;
      x += vx[i] * dt;
      z += vz[i] * dt;
      depth -= vy[i] * dt;
      if (depth < A.minDepth * 0.6) {
        depth = A.minDepth * 0.6;
        if (vy[i] > 0) vy[i] = 0;
      }
      if (depth > seabed - 0.4) {
        depth = seabed - 0.4;
        if (vy[i] < 0) vy[i] = 0;
      }

      // Guided agents cannot pass through the impermeable skirt above its lower edge.
      if (ns === S_GUIDED && guideSeg >= 0 && layout) {
        const nX = layout.nx[guideSeg];
        const nZ = layout.nz[guideSeg];
        const dNew = (x - layout.px[guideSeg]) * nX + (z - layout.pz[guideSeg]) * nZ;
        if (dNew < CA.minStandoff) {
          const push = CA.minStandoff - dNew;
          x += nX * push;
          z += nZ * push;
          const vn = vx[i] * nX + vz[i] * nZ;
          if (vn < 0) {
            vx[i] -= nX * vn;
            vz[i] -= nZ * vn;
          }
        }
        guided++;
      }
      if (ns === S_UNDER_SKIRT) underNow++;

      // Revetment.
      if (z < SITE.shore.toeZ - 1) {
        z = SITE.shore.toeZ - 1;
        if (vz[i] < 0) vz[i] = 0;
      }

      // Intake structure and screens.
      if (x > intake.x0 - 0.4 && x < intake.x1 + 0.4 && z < intake.mouthZ + 0.8) {
        if (x >= intake.x0 && x <= intake.x1 && depth < intake.sillDepth) {
          px[i] = x;
          pz[i] = intake.mouthZ + 0.3;
          py[i] = -depth;
          flags[i] = fl;
          this.intakeContact(i);
          continue;
        }
        if (z < intake.mouthZ) {
          const toW = x - (intake.x0 - 0.4);
          const toE = intake.x1 + 0.4 - x;
          if (toW < toE) {
            x = intake.x0 - 0.4;
            if (vx[i] > 0) vx[i] = 0;
          } else {
            x = intake.x1 + 0.4;
            if (vx[i] < 0) vx[i] = 0;
          }
        }
      }

      px[i] = x;
      pz[i] = z;
      py[i] = -depth;
      flags[i] = fl;
      if (ns !== st) {
        state[i] = ns;
        stateTime[i] = 0;
      }

      // Fate resolves as "passed" once an agent clears the intake reference line without contact,
      // so passes and contacts are counted at the same place (no in-flight bias).
      if (x > passLineX && !(fl & F_RESOLVED)) {
        fl |= F_RESOLVED;
        flags[i] = fl;
        counters.exited++;
      }
      // Agents whose outcome is settled stop being tracked: released jellyfish once they have
      // cleared the outlet plume, and passers once they are past the intake line. They fade out
      // and leave the simulation (already counted, so no metric changes).
      let keep = 1;
      if (ns === S_RELEASED) keep = 1 - (stateTime[i] - ASSUMPTIONS.release.trackTime) / ASSUMPTIONS.release.fadeTime;
      else if (fl & F_RESOLVED && !(fl & F_DIVERTED) && x > passLineX) keep = 1 - (x - passLineX) / ASSUMPTIONS.bloom.passedFadeDistance;
      if (keep <= 0) {
        pool.free(i);
        continue;
      }
      if (keep < fade[i]) fade[i] = keep;
      if (x > dom.xMax || x < dom.xMin || z > dom.zMax) {
        if (!(fl & F_RESOLVED)) {
          flags[i] = fl | F_RESOLVED;
          counters.exited++;
        }
        pool.free(i);
      }
    }
    this.guidedCount = guided;
    this.underSkirtNow = underNow;
  }

  private enqueue(i: number): void {
    const p = this.pool;
    const tr = this.transfer!;
    const c = this.counters;
    let fl = p.flags[i];
    if (!(fl & F_ENCOUNTERED)) {
      fl |= F_ENCOUNTERED;
      c.encountered++;
    }
    if (!(fl & F_RESOLVED)) {
      fl |= F_RESOLVED | F_DIVERTED;
      c.diverted++;
      if (p.contactStart[i] >= 0) {
        c.contactTimeSum += this.time - p.contactStart[i];
        c.contactTimeN++;
      }
    }
    p.flags[i] = fl;
    p.state[i] = S_TRANSFER_QUEUE;
    p.stateTime[i] = 0;
    p.queueIndex[i] = tr.queue.length;
    tr.queue.push(i);
    this.arrivalsThisStep++;
  }

  /** Motion inside the bellmouth and, when it is full, along the curtain face upstream of the mouth. */
  private queueDynamics(i: number, dt: number, relax: number, layout: CurtainLayout): void {
    const p = this.pool;
    const th = layout.throat;
    const tr = this.transfer!;
    const aid = p.id[i];
    const k = p.queueIndex[i];
    const spacing = (th.length - 0.6) / this.holdCapacity;
    const q = th.length - 0.5 - k * spacing;
    let tx: number;
    let tz: number;
    let tdepth: number;
    const depth = -p.py[i];
    if (q >= -0.3) {
      const hw = throatHalfWidthAt(th, q) * 0.55;
      const hh = throatHalfHeightAt(th, q) * 0.45;
      const lat = (hash01(aid, 11) - 0.5) * 2 * hw;
      const vert = (hash01(aid, 13) - 0.5) * 2 * hh;
      tx = th.mx + th.ax * q + th.lx * lat;
      tz = th.mz + th.az * q + th.lz * lat;
      tdepth = th.centerDepth + vert;
    } else {
      this.arcPoint(layout, layout.length + q);
      const off = 0.7 + hash01(aid, 17) * 0.9;
      tx = this.arc.x + this.arc.nx * off;
      tz = this.arc.z + this.arc.nz * off;
      tdepth = Math.min(Math.max(depth, 0.4), th.centerDepth + th.halfHeight - 0.4);
    }
    const vf = ASSUMPTIONS.throat.funnelSpeedBase + ASSUMPTIONS.throat.funnelSpeedFlow * (tr.throatOpen ? tr.availability() : 0);
    let dvx = (tx - p.px[i]) * 0.35;
    let dvz = (tz - p.pz[i]) * 0.35;
    const m = Math.hypot(dvx, dvz);
    if (m > vf) {
      dvx *= vf / m;
      dvz *= vf / m;
    }
    let dvy = (depth - tdepth) * 0.3;
    if (dvy > 0.08) dvy = 0.08;
    else if (dvy < -0.08) dvy = -0.08;
    // Gentle pulsing jitter so congested agents do not look frozen.
    dvx += (valueNoise(aid * 5 + 2, this.time * 0.3) - 0.5) * 0.03;
    dvz += (valueNoise(aid * 5 + 3, this.time * 0.3) - 0.5) * 0.03;
    p.vx[i] += (dvx - p.vx[i]) * relax * 2;
    p.vy[i] += (dvy - p.vy[i]) * relax * 2;
    p.vz[i] += (dvz - p.vz[i]) * relax * 2;
    p.px[i] += p.vx[i] * dt;
    p.pz[i] += p.vz[i] * dt;
    p.py[i] += p.vy[i] * dt;
    if (q < -0.3) this.backedUpCount++;
  }

  private arcPoint(L: CurtainLayout, s: number): void {
    const n = L.n;
    let k: number;
    let t: number;
    if (s <= 0) {
      k = 0;
      t = 0;
    } else if (s >= L.ps[n - 1]) {
      k = n - 2;
      t = 1;
    } else {
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (L.ps[mid] <= s) lo = mid;
        else hi = mid;
      }
      k = lo;
      t = (s - L.ps[lo]) / (L.ps[lo + 1] - L.ps[lo]);
    }
    this.arc.x = L.px[k] + (L.px[k + 1] - L.px[k]) * t;
    this.arc.z = L.pz[k] + (L.pz[k + 1] - L.pz[k]) * t;
    this.arc.nx = L.nx[k];
    this.arc.nz = L.nz[k];
  }

  private processTransfer(dt: number): void {
    const tr = this.transfer!;
    const layout = this.curtain!.layout;
    const th = layout.throat;
    const p = this.pool;
    const rate = tr.throatOpen ? tr.capacityRate() : 0;
    tr.tokens = Math.min(tr.tokens + rate * dt, 2);
    let processed = 0;
    while (tr.tokens >= 1 && tr.queue.length > 0) {
      const i = tr.queue[0];
      const q = (p.px[i] - th.mx) * th.ax + (p.pz[i] - th.mz) * th.az;
      if (q < th.length - 1.6) break;
      tr.queue.shift();
      tr.tokens -= 1;
      processed++;
      this.transferAgent(i);
    }
    if (processed > 0) this.reindexQueue();
    if (tr.queue.length === 0 && tr.tokens > 1) tr.tokens = 1;
    tr.processedEMA += (processed / dt - tr.processedEMA) * (1 - Math.exp(-dt / 45));
  }

  private reindexQueue(): void {
    const q = this.transfer!.queue;
    for (let j = 0; j < q.length; j++) this.pool.queueIndex[q[j]] = j;
  }

  private transferAgent(i: number): void {
    const p = this.pool;
    p.state[i] = S_TRANSFERRED;
    p.stateTime[i] = 0;
    p.queueIndex[i] = -1;
    const T = ASSUMPTIONS.transfer;
    p.timer[i] = (this.params.releaseDistance / T.pipeVelocity) * (0.95 + 0.1 * hash01(p.id[i], 23));
    this.counters.transferred++;
  }

  private releaseAgent(i: number): void {
    const p = this.pool;
    const r = SITE.release;
    const aid = p.id[i];
    const lat = (hash01(aid, 29) - 0.5) * 3;
    p.px[i] = r.x + r.dirX * 1.5 - r.dirZ * lat;
    p.pz[i] = r.z + r.dirZ * 1.5 + r.dirX * lat;
    p.py[i] = -(1.0 + hash01(aid, 31) * 1.4);
    const js = ASSUMPTIONS.release.jetSpeed;
    p.vx[i] = r.dirX * js;
    p.vy[i] = 0;
    p.vz[i] = r.dirZ * js;
    p.state[i] = S_RELEASED;
    p.stateTime[i] = 0;
    p.fade[i] = 0.25;
    this.counters.released++;
    this.releasesThisStep++;
    if ((this.counters.released & 3) === 0) this.pushMarker(p.px[i], p.py[i], p.pz[i], 'release');
  }

  private intakeContact(i: number): void {
    const p = this.pool;
    p.state[i] = S_INTAKE_CONTACT;
    p.stateTime[i] = 0;
    p.timer[i] = ASSUMPTIONS.intake.impingementDwell;
    p.vx[i] = 0;
    p.vy[i] = 0;
    p.vz[i] = 0;
    if (!(p.flags[i] & F_RESOLVED)) {
      p.flags[i] |= F_RESOLVED;
      this.counters.intakeContacts++;
      this.intakeTimes.push(this.time);
    }
    this.pushMarker(p.px[i], p.py[i], p.pz[i], 'intake');
  }

  /**
   * Release everything still waiting in the throat (SafeOpen with no transfer
   * capacity left). These agents are no longer counted as diverted.
   */
  releaseQueue(): number {
    const tr = this.transfer;
    if (!tr) return 0;
    const p = this.pool;
    const n = tr.queue.length;
    for (const i of tr.queue) {
      p.state[i] = S_FREE_DRIFT;
      p.queueIndex[i] = -1;
      p.flags[i] = (p.flags[i] & ~(F_RESOLVED | F_DIVERTED)) | F_REEF_RELEASED;
      this.counters.diverted--;
      this.counters.reefReleased++;
    }
    tr.queue.length = 0;
    return n;
  }

  private pushMarker(x: number, y: number, z: number, kind: MarkerKind): void {
    const m: Marker = { x, y, z, t: this.time, kind };
    if (this.markers.length < MARKER_CAPACITY) this.markers.push(m);
    else this.markers[this.markerSeq % MARKER_CAPACITY] = m;
    this.markerSeq++;
  }

  private updateLoad(dt: number): void {
    const c = this.curtain;
    this.debrisLoad += (this.debrisTarget - this.debrisLoad) * (1 - Math.exp(-dt / 12));
    if (!c || c.activeCount === 0) {
      this.curtainLoad += (0 - this.curtainLoad) * (1 - Math.exp(-dt / 5));
      return;
    }
    const Ld = ASSUMPTIONS.loads;
    const P = this.params;
    const activeFrac = c.activeCount / c.layout.segCount;
    const hydro = (c.normalVelocity / Ld.designNormalVelocity) ** 2 * (c.skirtActual / Ld.designSkirt);
    const wave = (P.waveHeight / Ld.designWave) ** 2;
    const bio = (this.guidedCount + this.backedUpCount) / ((Ld.designGuidedPerThousand * P.agentBudget) / 1000);
    const raw = (Ld.hydroWeight * hydro + Ld.waveWeight * wave + Ld.biomassWeight * bio) * activeFrac + this.debrisLoad * activeFrac;
    this.curtainLoad += (raw - this.curtainLoad) * (1 - Math.exp(-dt / 5));
  }

  private pruneIntakeTimes(): void {
    const cutoff = this.time - ASSUMPTIONS.metrics.rateWindow;
    let n = 0;
    while (n < this.intakeTimes.length && this.intakeTimes[n] < cutoff) n++;
    if (n > 0) this.intakeTimes.splice(0, n);
  }

  /** Intake contacts per minute over the rolling window. */
  intakeRatePerMin(): number {
    const w = Math.min(ASSUMPTIONS.metrics.rateWindow, Math.max(this.time, 1));
    return (this.intakeTimes.length / w) * 60;
  }

  /** Count agents currently in a given state. */
  countState(s: number): number {
    const st = this.pool.state;
    let n = 0;
    for (let i = 0; i < st.length; i++) if (st[i] === s) n++;
    return n;
  }

  /** Bloom depth percentile (normal approximation of the configured distribution). */
  bloomDepthPercentile(p: 0.5 | 0.9 | 0.95): number {
    const z = p === 0.5 ? 0 : p === 0.9 ? 1.2816 : 1.6449;
    return this.params.bloomMeanDepth + z * this.params.bloomDepthSD;
  }

  agentInfo(slot: number): AgentInfo | null {
    const p = this.pool;
    if (slot < 0 || slot >= p.capacity || p.state[slot] === S_INACTIVE) return null;
    const s = p.state[slot];
    return {
      id: p.id[slot],
      slot,
      state: STATE_NAMES[s],
      depth: -p.py[slot],
      speed: Math.hypot(p.vx[slot], p.vy[slot], p.vz[slot]),
      x: p.px[slot],
      z: p.pz[slot],
      size: p.size[slot],
      contactTime: p.contactStart[slot] >= 0 ? this.time - p.contactStart[slot] : null,
      transitRemaining: s === S_TRANSFERRED ? p.timer[slot] : null,
    };
  }
}
