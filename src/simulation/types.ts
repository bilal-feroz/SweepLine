export type EngineKind = 'baseline' | 'sweepline';

/** Pre-engineered anchor configurations (degrees between curtain and nominal current). */
export type AnchorAngle = 15 | 20 | 25;
export const ANCHOR_ANGLES: readonly AnchorAngle[] = [15, 20, 25];

export interface SimParams {
  seed: number;
  /** Simulated agent budget (performance setting; rates scale with it). */
  agentBudget: number;
  /** Bloom density, 0..1. */
  bloomDensity: number;
  /** Bloom mean depth (m). */
  bloomMeanDepth: number;
  /** Bloom depth standard deviation (m). */
  bloomDepthSD: number;
  /** Current speed (m/s). */
  currentSpeed: number;
  /** Direction the current flows toward (compass bearing, degrees). */
  currentBearing: number;
  /** Significant wave height Hs (m). */
  waveHeight: number;
  /** Skirt depth setpoint (m). */
  skirtDepth: number;
  /** Anchor layout — fixed while the curtain is deployed. */
  anchorAngle: AnchorAngle;
  /** Transfer capacity setpoint, 0..1 of design. */
  transferCapacity: number;
  /** Whether the optional standby transfer path is installed/armed. */
  standbyEnabled: boolean;
  /** Assumed transfer-line length to the safe release zone (m). */
  releaseDistance: number;
  /** Deploy automatically once the early warning arrives and the envelope is satisfied. */
  autoDeploy: boolean;
  /** Reference conditions recorded with the run (not used by the agent model). */
  waterTemp: number;
  salinity: number;
}

export const DEFAULT_PARAMS: SimParams = {
  seed: 240826,
  agentBudget: 1000,
  bloomDensity: 0.72,
  bloomMeanDepth: 1.8,
  bloomDepthSD: 0.8,
  currentSpeed: 0.32,
  currentBearing: 112,
  waveHeight: 0.8,
  skirtDepth: 3.0,
  anchorAngle: 20,
  transferCapacity: 0.9,
  standbyEnabled: true,
  releaseDistance: 500,
  autoDeploy: true,
  waterTemp: 28.6,
  salinity: 41.2,
};

export type CurtainMode = 'STOWED' | 'DEPLOYING' | 'DEPLOYED' | 'REEFING' | 'REEFED' | 'UNREEFING' | 'STOWING';

export type ModuleStatus = 'ONLINE' | 'STANDBY' | 'ACTIVATING' | 'FAULT' | 'DISABLED' | 'OFF';

export type FailureKey =
  | 'transferPrimary'
  | 'transferStandby'
  | 'extremeCurrent'
  | 'deepBloom'
  | 'highDensity'
  | 'curtainOverload'
  | 'highWaves';

export type SafeOpenPhase =
  | 'IDLE'
  | 'INITIATED'
  | 'UPSTREAM_REEF'
  | 'CLEARING'
  | 'PROGRESSIVE_REEF'
  | 'THROAT_CLEAR'
  | 'COMPLETE';

export type StatusCode =
  | 'READY'
  | 'WARNING'
  | 'DEPLOYING'
  | 'NOMINAL'
  | 'ELEVATED'
  | 'SAFEOPEN'
  | 'BASELINE_RESTORED'
  | 'OUTSIDE_ENVELOPE'
  | 'STANDBY';

export type EventLevel = 'info' | 'ok' | 'warn' | 'alarm';

export interface SimEvent {
  id: number;
  t: number;
  level: EventLevel;
  message: string;
}
