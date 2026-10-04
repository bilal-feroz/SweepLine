import { ASSUMPTIONS } from '../config/assumptions';
import { S_TRANSFERRED } from './Agent';
import type { SimulationEngine } from './SimulationEngine';
import type { EngineKind } from './types';

export type ScreenLoad = 'LOW' | 'MEDIUM' | 'HIGH';
export type LoadLabel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'OVERLOAD' | 'INACTIVE';

/**
 * Metrics derived from simulation state. All values are simulation estimates.
 * Percentages use resolved outcomes only (agents still in progress are excluded),
 * and are null until a minimum sample has resolved.
 */
export interface EngineMetrics {
  kind: EngineKind;
  time: number;
  active: number;
  spawned: number;
  /** Agents that reached the intake screens (cumulative). */
  intakeContacts: number;
  /** Intake contacts / all resolved fates (contact, diverted, passed). */
  intakeContactPct: number | null;
  intakeRatePerMin: number;
  screenLoad: ScreenLoad;
  resolved: number;
  encountered: number;
  diverted: number;
  /** Diverted / resolved encounters. */
  diversionEfficiency: number | null;
  underSkirt: number;
  underSkirtPct: number | null;
  overtopped: number;
  reefReleased: number;
  /** Agents currently guided along the curtain (curtain occupancy). */
  guided: number;
  avgContactTime: number | null;
  throatQueue: number;
  throatOccupancy: number;
  transferred: number;
  inTransit: number;
  released: number;
  transferUtilisation: number | null;
  transferRatePerMin: number;
  transferFlowM3h: number;
  curtainLoad: number;
  curtainLoadLabel: LoadLabel;
}

export function screenLoadFor(ratePerMin: number, budget: number): ScreenLoad {
  const r = ratePerMin / Math.max(budget / 1000, 0.05);
  if (r >= ASSUMPTIONS.metrics.screenLoadHigh) return 'HIGH';
  if (r >= ASSUMPTIONS.metrics.screenLoadMedium) return 'MEDIUM';
  return 'LOW';
}

export function loadLabel(load: number, active: boolean): LoadLabel {
  if (!active) return 'INACTIVE';
  if (load >= 1) return 'OVERLOAD';
  if (load >= 0.8) return 'HIGH';
  if (load >= 0.6) return 'ELEVATED';
  return 'NORMAL';
}

export function computeEngineMetrics(e: SimulationEngine): EngineMetrics {
  const c = e.counters;
  const min = ASSUMPTIONS.metrics.minSample;
  const resolved = c.intakeContacts + c.diverted + c.exited;
  const encResolved = c.diverted + c.underSkirt + c.overtopped + c.reefReleased;
  const tr = e.transfer;
  const capRate = tr ? tr.capacityRate() : 0;
  const rate = e.intakeRatePerMin();
  const curtainActive = !!e.curtain && e.curtain.activeCount > 0;
  return {
    kind: e.kind,
    time: e.time,
    active: e.pool.active,
    spawned: c.spawned,
    intakeContacts: c.intakeContacts,
    intakeContactPct: resolved >= min ? c.intakeContacts / resolved : null,
    intakeRatePerMin: rate,
    screenLoad: screenLoadFor(rate, e.params.agentBudget),
    resolved,
    encountered: c.encountered,
    diverted: c.diverted,
    diversionEfficiency: encResolved >= min ? c.diverted / encResolved : null,
    underSkirt: c.underSkirt,
    underSkirtPct: encResolved >= min ? c.underSkirt / encResolved : null,
    overtopped: c.overtopped,
    reefReleased: c.reefReleased,
    guided: e.guidedCount + e.backedUpCount,
    avgContactTime: c.contactTimeN > 0 ? c.contactTimeSum / c.contactTimeN : null,
    throatQueue: tr ? tr.queue.length : 0,
    throatOccupancy: tr ? tr.queue.length / e.holdCapacity : 0,
    transferred: c.transferred,
    inTransit: tr ? e.countState(S_TRANSFERRED) : 0,
    released: c.released,
    transferUtilisation: tr && tr.throatOpen ? (capRate > 0 ? Math.min(1.5, tr.processedEMA / capRate) : 1) : null,
    transferRatePerMin: tr ? tr.processedEMA * 60 : 0,
    transferFlowM3h: tr ? tr.flowM3h() : 0,
    curtainLoad: e.curtainLoad,
    curtainLoadLabel: loadLabel(e.curtainLoad, curtainActive),
  };
}
