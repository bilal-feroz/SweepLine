import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE, type EnvelopeKey } from '../config/operatingEnvelope';
import { bloomP90 } from './curtain';
import type { EngineMetrics } from './metrics';
import type { SimulationEngine } from './SimulationEngine';
import type { SafeOpenPhase, SimParams } from './types';

export type ConstraintStatus = 'ok' | 'near' | 'out' | 'na';

export interface EnvelopeConstraint {
  key: EnvelopeKey;
  label: string;
  value: string;
  limit: string;
  status: ConstraintStatus;
  kind: 'hard' | 'advisory';
  /** Whether this constraint is evaluated before deployment (environmental) or only live. */
  scope: 'environment' | 'live';
  note?: string;
}

export type Recommendation =
  | 'DEPLOYMENT PERMITTED'
  | 'DO NOT DEPLOY'
  | 'INITIATE SAFEOPEN'
  | 'CONTINUE OPERATION'
  | 'MONITOR'
  | 'INCREASE SKIRT DEPTH'
  | 'RE-ARM AVAILABLE'
  | 'HOLD — BASELINE PROTECTION';

export interface EnvelopeResult {
  constraints: EnvelopeConstraint[];
  satisfied: number;
  total: number;
  /** No hard or advisory constraint outside its limit. */
  within: boolean;
  /** Environmental (pre-deployment) hard limits all satisfied. */
  deployPermitted: boolean;
  hardViolations: EnvelopeConstraint[];
  advisories: EnvelopeConstraint[];
  recommendation: Recommendation;
}

const fmt = (v: number, d = 2) => v.toFixed(d);

/** Evaluate the assumed operating envelope against current inputs and live SweepLine state. */
export function evaluateEnvelope(
  params: SimParams,
  engine: SimulationEngine,
  m: EngineMetrics,
  deployed: boolean,
  safeOpenActive: boolean,
  safeOpenComplete: boolean,
): EnvelopeResult {
  const E = OPERATING_ENVELOPE;
  const list: EnvelopeConstraint[] = [];
  const curtain = engine.curtain!;

  const band = (v: number, near: number, max: number): ConstraintStatus => (v > max ? 'out' : v > near ? 'near' : 'ok');

  list.push({
    key: 'currentSpeed',
    label: E.currentSpeed.label,
    value: `${fmt(params.currentSpeed)} m/s`,
    limit: `≤ ${fmt(E.currentSpeed.max)} m/s`,
    status: band(params.currentSpeed, E.currentSpeed.near, E.currentSpeed.max),
    kind: 'hard',
    scope: 'environment',
  });
  list.push({
    key: 'waveHeight',
    label: E.waveHeight.label,
    value: `${fmt(params.waveHeight, 1)} m`,
    limit: `≤ ${fmt(E.waveHeight.max, 1)} m`,
    status: band(params.waveHeight, E.waveHeight.near, E.waveHeight.max),
    kind: 'hard',
    scope: 'environment',
  });
  const attack = engine.flow.attackAngle(params.anchorAngle, params.currentBearing);
  const aE = E.attackAngle;
  list.push({
    key: 'attackAngle',
    label: aE.label,
    value: `${attack.toFixed(0)}°`,
    limit: `${aE.min}–${aE.max}°`,
    status:
      attack < aE.min || attack > aE.max
        ? 'out'
        : attack < aE.min + aE.nearMargin || attack > aE.max - aE.nearMargin
          ? 'near'
          : 'ok',
    kind: 'hard',
    scope: 'environment',
  });
  const p90 = bloomP90(params);
  const skirtCap = curtain.clearanceLimitedMax;
  // The skirt the winches hold, including any automatic lowering for a deep bloom.
  const skirt = curtain.skirtTarget;
  list.push({
    key: 'bloomDepth',
    label: E.bloomDepth.label,
    value: `${fmt(p90, 1)} m`,
    limit: `≤ skirt ${fmt(skirt, 1)} m`,
    status: p90 > Math.min(E.bloomDepth.absoluteMax, skirtCap) ? 'out' : p90 > skirt ? 'near' : 'ok',
    kind: 'advisory',
    scope: 'environment',
    note:
      p90 > Math.min(E.bloomDepth.absoluteMax, skirtCap)
        ? 'Bloom deeper than maximum skirt — SweepLine ineffective'
        : p90 > skirt
          ? 'Increase skirt depth to intercept P90'
          : undefined,
  });
  const clearance = curtain.seabedClearance();
  list.push({
    key: 'seabedClearance',
    label: E.seabedClearance.label,
    value: `${fmt(clearance, 1)} m`,
    limit: `≥ ${fmt(E.seabedClearance.min, 1)} m`,
    status: clearance < E.seabedClearance.min ? 'out' : clearance < E.seabedClearance.min + 0.5 ? 'near' : 'ok',
    kind: 'hard',
    scope: 'environment',
  });

  const live = deployed && !safeOpenComplete;
  const loadPct = m.curtainLoad * 100;
  list.push({
    key: 'curtainLoad',
    label: E.curtainLoad.label,
    value: live ? `${loadPct.toFixed(0)} %` : '—',
    limit: `≤ ${E.curtainLoad.max} %`,
    status: live ? band(loadPct, E.curtainLoad.near, E.curtainLoad.max) : 'na',
    kind: 'hard',
    scope: 'live',
  });
  const util = m.transferUtilisation;
  const occ = m.throatOccupancy * 100;
  list.push({
    key: 'transferUtilisation',
    label: E.transferUtilisation.label,
    value: live && util !== null ? `${(util * 100).toFixed(0)} %` : '—',
    limit: `< ${E.transferUtilisation.max} %`,
    status:
      live && util !== null
        ? util * 100 >= E.transferUtilisation.max && occ > E.throatOccupancy.near
          ? 'out'
          : util * 100 > E.transferUtilisation.near
            ? 'near'
            : 'ok'
        : 'na',
    kind: 'hard',
    scope: 'live',
  });
  list.push({
    key: 'throatOccupancy',
    label: E.throatOccupancy.label,
    value: live ? `${occ.toFixed(0)} %` : '—',
    limit: `≤ ${E.throatOccupancy.max} %`,
    status: live ? band(occ, E.throatOccupancy.near, E.throatOccupancy.max) : 'na',
    kind: 'hard',
    scope: 'live',
  });
  const tr = engine.transfer!;
  const path = tr.activePath;
  list.push({
    key: 'transferPath',
    label: E.transferPath.label,
    value: !live ? '—' : path === 'PRIMARY' ? 'Primary' : path === 'STANDBY' ? 'Standby' : path === 'PASSIVE' ? 'Passive only' : 'None',
    limit: 'Powered path',
    status: !live
      ? tr.poweredPathAvailable
        ? 'na'
        : 'out'
      : path === 'PRIMARY'
        ? 'ok'
        : path === 'STANDBY' || (tr.primaryFault && tr.poweredPathAvailable)
          ? 'near'
          : 'out',
    kind: 'hard',
    scope: 'live',
  });

  const evaluated = list.filter((c) => c.status !== 'na' || c.scope === 'live');
  const satisfied = evaluated.filter((c) => c.status !== 'out').length;
  const hardViolations = list.filter((c) => c.kind === 'hard' && c.status === 'out');
  const advisories = list.filter((c) => c.kind === 'advisory' && c.status !== 'ok' && c.status !== 'na');
  const envHard = hardViolations.filter((c) => c.scope === 'environment');
  const deployPermitted = envHard.length === 0 && tr.poweredPathAvailable;
  const bloomOut = list.find((c) => c.key === 'bloomDepth')!.status === 'out';

  let recommendation: Recommendation;
  if (safeOpenActive) recommendation = 'HOLD — BASELINE PROTECTION';
  else if (safeOpenComplete) recommendation = deployPermitted && !bloomOut ? 'RE-ARM AVAILABLE' : 'HOLD — BASELINE PROTECTION';
  else if (!deployed) recommendation = deployPermitted && !bloomOut ? 'DEPLOYMENT PERMITTED' : 'DO NOT DEPLOY';
  else if (hardViolations.length > 0) recommendation = 'INITIATE SAFEOPEN';
  else if (bloomOut) recommendation = 'INITIATE SAFEOPEN';
  else if (advisories.length > 0) recommendation = 'INCREASE SKIRT DEPTH';
  else if (list.some((c) => c.status === 'near')) recommendation = 'MONITOR';
  else recommendation = 'CONTINUE OPERATION';

  return {
    constraints: list,
    satisfied,
    total: evaluated.length,
    within: hardViolations.length === 0 && !bloomOut,
    deployPermitted: deployPermitted && !bloomOut,
    hardViolations,
    advisories,
    recommendation,
  };
}

export interface SafeOpenState {
  phase: SafeOpenPhase;
  reason: string;
  startedAt: number;
  phaseStartedAt: number;
  lastReefLog: number;
}

/**
 * SafeOpen fail-safe sequencing (Layer 2).
 *
 * 1. Stop accepting new bloom traffic.
 * 2. Reef the UPSTREAM section first.
 * 3. Keep the transfer system operating.
 * 4. Clear jellyfish already travelling along SweepLine.
 * 5. Progressively reef the remaining curtain.
 * 6. Return the site to the baseline existing intake-protection state.
 *
 * The throat / downstream end is never opened first — that could release a
 * concentrated group close to the intake.
 */
export class SafeOpenController {
  state: SafeOpenState = { phase: 'IDLE', reason: '', startedAt: 0, phaseStartedAt: 0, lastReefLog: 0 };

  get active(): boolean {
    return this.state.phase !== 'IDLE' && this.state.phase !== 'COMPLETE';
  }

  get complete(): boolean {
    return this.state.phase === 'COMPLETE';
  }

  reset(): void {
    this.state = { phase: 'IDLE', reason: '', startedAt: 0, phaseStartedAt: 0, lastReefLog: 0 };
  }

  initiate(engine: SimulationEngine, reason: string, log: (level: 'alarm' | 'warn' | 'ok' | 'info', msg: string) => void): boolean {
    const c = engine.curtain;
    if (!c || this.active) return false;
    if (!c.beginReef()) return false;
    this.state = { phase: 'INITIATED', reason, startedAt: engine.time, phaseStartedAt: engine.time, lastReefLog: 0 };
    log('alarm', `SafeOpen initiated — ${reason}`);
    log('warn', 'Stop accepting new bloom traffic');
    return true;
  }

  update(engine: SimulationEngine, log: (level: 'alarm' | 'warn' | 'ok' | 'info', msg: string) => void): void {
    const c = engine.curtain;
    const tr = engine.transfer;
    if (!c || !tr || !this.active) return;
    const S = ASSUMPTIONS.safeOpen;
    const s = this.state;
    const t = engine.time;
    const pt = t - s.phaseStartedAt;
    const L = c.length;
    const goto = (phase: SafeOpenPhase) => {
      s.phase = phase;
      s.phaseStartedAt = t;
    };

    switch (s.phase) {
      case 'INITIATED':
        c.reefSpeed = 0;
        if (pt >= 2) {
          goto('UPSTREAM_REEF');
          log('warn', 'Upstream reef started — upstream end retracts first');
        }
        break;
      case 'UPSTREAM_REEF':
        c.reefSpeed = S.upstreamReefSpeed;
        if (c.reefFront >= S.upstreamFraction * L) {
          goto('CLEARING');
          log('info', `Upstream section reefed — new bloom traffic follows natural trajectory`);
          log('info', `Existing SweepLine traffic clearing (${engine.guidedCount + engine.backedUpCount} on curtain, ${tr.queue.length} in throat)`);
        }
        break;
      case 'CLEARING': {
        c.reefSpeed = S.clearingReefSpeed;
        const onCurtain = engine.guidedCount + engine.backedUpCount;
        if (onCurtain <= S.clearingThreshold || pt >= S.maxClearingTime || c.reefFront >= 0.85 * L) {
          goto('PROGRESSIVE_REEF');
          log('info', 'Curtain traffic cleared — progressive reef of remaining curtain');
        }
        break;
      }
      case 'PROGRESSIVE_REEF':
        c.reefSpeed = S.finalReefSpeed;
        if (c.mode === 'REEFED') {
          tr.acceptingNew = false;
          goto('THROAT_CLEAR');
          log('info', `Curtain 100% reefed — throat clearing (${tr.queue.length} remaining)`);
        }
        break;
      case 'THROAT_CLEAR':
        if (tr.queue.length === 0 || pt >= S.throatClearTimeout) {
          if (tr.queue.length > 0) {
            const n = engine.releaseQueue();
            log('warn', `${n} jellyfish released gently at throat (transfer capacity exhausted)`);
          }
          tr.throatOpen = false;
          goto('COMPLETE');
          log('ok', 'Baseline intake protection restored — existing screens (Layer 3) unchanged');
        }
        break;
      default:
        break;
    }

    // Reef progress milestones.
    if (s.phase !== 'INITIATED' && s.phase !== 'COMPLETE') {
      const pct = Math.min(100, Math.floor((c.reefedFraction * 100) / 20) * 20);
      if (pct > s.lastReefLog && pct < 100) {
        s.lastReefLog = pct;
        log('info', `Curtain ${pct}% reefed`);
      }
    }
  }
}
