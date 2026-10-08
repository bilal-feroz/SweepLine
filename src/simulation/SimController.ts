import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { S_APPROACHING, S_GUIDED, S_TRANSFER_QUEUE } from './Agent';
import { computeEngineMetrics, type EngineMetrics } from './metrics';
import { evaluateEnvelope, SafeOpenController, type EnvelopeResult } from './safety';
import { getScenario, type Scenario, type ScenarioStep } from './scenarios';
import { SimulationEngine, type AgentInfo } from './SimulationEngine';
import {
  DEFAULT_PARAMS,
  type DeployMode,
  type AnchorAngle,
  type CurtainMode,
  type EngineKind,
  type EventLevel,
  type FailureKey,
  type ModuleStatus,
  type SafeOpenPhase,
  type SimEvent,
  type SimParams,
  type StatusCode,
} from './types';

export type StageKey = 'bloom' | 'warning' | 'deploy' | 'sweep' | 'transfer' | 'release' | 'recovery';

export interface TimelineStage {
  key: StageKey;
  label: string;
  at: number | null;
}

export interface SystemStatus {
  code: StatusCode;
  label: string;
  detail: string;
  tone: 'ok' | 'info' | 'warn' | 'alarm';
}

export interface HistorySample {
  t: number;
  bContacts: number;
  sContacts: number;
  bRate: number;
  sRate: number;
  bPct: number | null;
  sPct: number | null;
  diverted: number;
  underSkirt: number;
  underPct: number | null;
  efficiency: number | null;
  utilisation: number | null;
  load: number;
  occupancy: number;
  contactTime: number | null;
  guided: number;
  transferred: number;
  released: number;
  flow: number;
}

export interface SimSnapshot {
  ready: boolean;
  simTime: number;
  clockMs: number;
  speed: number;
  paused: boolean;
  params: SimParams;
  scenarioId: string | null;
  scenarioName: string;
  baseline: EngineMetrics;
  sweepline: EngineMetrics;
  status: SystemStatus;
  curtain: {
    mode: CurtainMode;
    deployedPct: number;
    reefedPct: number;
    angle: number;
    length: number;
    skirtActual: number;
    skirtTarget: number;
    attackAngle: number;
    liftAngle: number;
    normalVelocity: number;
    activeFraction: number;
    clearanceMax: number;
    /** Delivered jet output 0..1 and what it means physically (first estimates). */
    jetOutput: number;
    jetConveyor: number;
    jetFlowM3s: number;
    jetPowerKW: number;
    /** Method of the current (or last) deployment and the time left before its front moves. */
    deployMode: DeployMode;
    deployDelay: number;
  };
  transfer: {
    primary: ModuleStatus;
    standby: ModuleStatus;
    standbyEnabled: boolean;
    path: string;
    availability: number;
    flowM3h: number;
    capacityPerMin: number;
    queue: number;
    holdCapacity: number;
  };
  safeOpen: { phase: SafeOpenPhase; reason: string; elapsed: number };
  envelope: EnvelopeResult;
  timeline: TimelineStage[];
  stage: StageKey;
  events: SimEvent[];
  failures: Record<FailureKey, boolean>;
  bloom: { p50: number; p90: number; active: boolean; arrivalsPerMin: number; warningAt: number | null };
  selectedAgent: (AgentInfo & { engine: EngineKind }) | null;
  underSkirtSeq: number;
}

export interface LoadingState {
  active: boolean;
  progress: number;
  label: string;
}

type Publisher = (snap: SimSnapshot) => void;
type LoadingPublisher = (state: LoadingState) => void;

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'bloom', label: 'Bloom Approach' },
  { key: 'warning', label: 'Warning Received' },
  { key: 'deploy', label: 'Deploy SweepLine' },
  { key: 'sweep', label: 'Sweep' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'release', label: 'Release' },
  { key: 'recovery', label: 'Recovery / Standby' },
];

const FAILURE_LABELS: Record<FailureKey, string> = {
  transferPrimary: 'Primary transfer failure',
  transferStandby: 'Standby transfer failure',
  extremeCurrent: 'Extreme current',
  deepBloom: 'Deep bloom',
  highDensity: 'High bloom density',
  curtainOverload: 'Curtain overload',
  highWaves: 'High wave state',
};

const noFailures = (): Record<FailureKey, boolean> => ({
  transferPrimary: false,
  transferStandby: false,
  extremeCurrent: false,
  deepBloom: false,
  highDensity: false,
  curtainOverload: false,
  highWaves: false,
});

/** Yield to the event loop between pre-roll chunks (timers keep running in background windows, unlike rAF). */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type RequestIdle = (cb: (deadline: { timeRemaining(): number; didTimeout: boolean }) => void, opts?: { timeout?: number }) => number;

/**
 * Wait for idle time between frames and resolve with the budget (ms) it offers, capped at
 * `cap`. Without requestIdleCallback, or when starved past the timeout, fall back to a
 * timer yield and the full cap so the pre-roll always progresses.
 */
function idleBudget(cap: number): Promise<number> {
  const ric = (globalThis as { requestIdleCallback?: RequestIdle }).requestIdleCallback;
  if (!ric) return nextFrame().then(() => cap);
  return new Promise((resolve) => ric((d) => resolve(d.didTimeout ? cap : Math.min(cap, d.timeRemaining() - 1)), { timeout: 60 }));
}

/**
 * Runtime controller. Owns the baseline and SweepLine engines (same seed, same
 * bloom), advances them in lock-step, runs the safety logic, records the
 * timeline, event log and metric history, and publishes snapshots to the UI at
 * a few hertz. React never touches per-frame simulation state.
 */
export class SimController {
  params: SimParams = { ...DEFAULT_PARAMS };
  readonly baseline: SimulationEngine;
  readonly sweepline: SimulationEngine;
  readonly safeOpen = new SafeOpenController();
  speed = 5;
  paused = false;
  ready = false;
  /** Main-thread budget per pre-roll chunk (ms); lowered while an animation must stay smooth. */
  preRollSliceMs = 24;
  /** Run pre-roll chunks only in idle time between frames (set while an animation must stay smooth). */
  preRollIdle = false;
  scenario: Scenario | null = null;
  failures = noFailures();
  events: SimEvent[] = [];
  timeline: TimelineStage[] = STAGES.map((s) => ({ ...s, at: null }));
  history: HistorySample[] = [];
  historyVersion = 0;
  envelope: EnvelopeResult;
  clockStart = Date.now();
  selection: { engine: EngineKind; agentId: number } | null = null;

  private publisher: Publisher | null = null;
  private loadingPublisher: LoadingPublisher | null = null;
  private acc = 0;
  private lastPublish = 0;
  private eventId = 1;
  private warningAt: number | null = null;
  private safetyTimer = 0;
  private historyTimer = 0;
  private stowCheckTimer = 0;
  private envOkFor = 0;
  private deployBlockLogged = false;
  private dwell: Record<string, number> = {};
  private transferLossFor = 0;
  private prevPrimary: ModuleStatus = 'STANDBY';
  private prevStandby: ModuleStatus = 'STANDBY';
  private prevCurtainMode: CurtainMode = 'STOWED';
  private savedParams: Partial<SimParams> = {};
  private script: ScenarioStep[] = [];
  private runStart = 0;
  private skirtLogTimer: ReturnType<typeof setTimeout> | null = null;
  private jetLogTimer: ReturnType<typeof setTimeout> | null = null;
  /** Counts deployments so per-deployment events are logged once each. */
  private deployCount = 0;
  private runToken = 0;
  /** Set when the operator stows the curtain: suppresses auto-deployment until they deploy again. */
  private standDown = false;

  constructor() {
    this.baseline = new SimulationEngine('baseline', this.params);
    this.sweepline = new SimulationEngine('sweepline', this.params);
    const m = computeEngineMetrics(this.sweepline);
    this.envelope = evaluateEnvelope(this.params, this.sweepline, m, false, false, false);
  }

  setPublisher(p: Publisher, loading: LoadingPublisher): void {
    this.publisher = p;
    this.loadingPublisher = loading;
  }

  get simTime(): number {
    return this.sweepline.time;
  }

  engine(kind: EngineKind): SimulationEngine {
    return kind === 'baseline' ? this.baseline : this.sweepline;
  }

  // ------------------------------------------------------------------ run control

  /** Restart both engines with the same seed and bloom. */
  async restart(start: 'sequence' | 'steady', scenario: Scenario | null = this.scenario): Promise<void> {
    const token = ++this.runToken;
    this.ready = false;
    this.scenario = scenario;
    this.failures = noFailures();
    this.savedParams = {};
    this.events = [];
    this.history = [];
    this.historyVersion++;
    this.timeline = STAGES.map((s) => ({ ...s, at: null }));
    this.warningAt = null;
    this.safeOpen.reset();
    this.acc = 0;
    this.safetyTimer = 0;
    this.historyTimer = 0;
    this.stowCheckTimer = 0;
    this.envOkFor = 0;
    this.deployBlockLogged = false;
    this.dwell = {};
    this.transferLossFor = 0;
    this.prevPrimary = 'STANDBY';
    this.prevStandby = 'STANDBY';
    this.prevCurtainMode = 'STOWED';
    this.selection = null;
    this.standDown = false;
    this.baseline.reset(this.params, 'approach');
    this.sweepline.reset(this.params, 'approach');
    this.timeline[0].at = 0;
    this.log('info', `Run started — ${scenario ? scenario.name : this.isReferenceRun() ? 'reference conditions' : 'custom conditions'} · seed ${this.params.seed}`);
    this.log('info', `Bloom approach — Blue Blubber (Catostylus mosaicus), density ${(this.params.bloomDensity * 100).toFixed(0)}%`);

    if (start === 'steady') {
      // A workboat deployment first has to mobilise before steady operation can begin.
      const target = ASSUMPTIONS.sequence.steadyPreRoll + (this.params.deployMode === 'workboat' ? ASSUMPTIONS.deploy.workboatMobilisation : 0);
      const h = ASSUMPTIONS.sequence.preRollStep;
      this.loadingPublisher?.({ active: true, progress: 0, label: 'Pre-rolling simulation to steady operation' });
      while (this.sweepline.time < target) {
        if (token !== this.runToken) return;
        const budget = this.preRollIdle ? await idleBudget(this.preRollSliceMs) : this.preRollSliceMs;
        if (token !== this.runToken) return;
        const t0 = performance.now();
        while (this.sweepline.time < target && performance.now() - t0 < budget) this.stepAll(h);
        this.loadingPublisher?.({
          active: true,
          progress: Math.min(1, this.sweepline.time / target),
          label: `Pre-rolling simulation · ${formatDuration(this.sweepline.time)} / ${formatDuration(target)}`,
        });
        if (!this.preRollIdle) await nextFrame();
      }
    }
    if (token !== this.runToken) return;
    this.clockStart = Date.now() - this.sweepline.time * 1000;
    this.runStart = this.sweepline.time;
    this.script = scenario?.script ? [...scenario.script].sort((a, b) => a.at - b.at) : [];
    this.ready = true;
    this.loadingPublisher?.({ active: false, progress: 1, label: '' });
    this.publish(true);
  }

  async runScenario(id: string): Promise<void> {
    const sc = getScenario(id);
    if (!sc) return;
    this.params = { ...DEFAULT_PARAMS, seed: this.params.seed, agentBudget: this.params.agentBudget, releaseDistance: this.params.releaseDistance, ...sc.params };
    await this.restart(sc.start, sc);
  }

  /** Load a scenario's parameters into the running simulation without restarting. */
  loadScenario(id: string): void {
    const sc = getScenario(id);
    if (!sc) return;
    this.scenario = sc;
    const p: Partial<SimParams> = { ...sc.params };
    if (this.sweepline.curtain!.mode !== 'STOWED') delete p.anchorAngle;
    this.setParams(p, { silent: true });
    this.log('info', `Scenario parameters loaded — ${sc.name}`);
    this.publish(true);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.publish(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.publish(true);
  }

  // ------------------------------------------------------------------ parameters

  setParams(partial: Partial<SimParams>, opts: { silent?: boolean } = {}): void {
    const p = { ...partial };
    const c = this.sweepline.curtain!;
    if (p.anchorAngle !== undefined && p.anchorAngle !== this.params.anchorAngle && c.mode !== 'STOWED') {
      this.log('warn', 'Anchor layout is fixed while SweepLine is deployed — reef and stow to change configuration');
      delete p.anchorAngle;
    }
    if (p.skirtDepth !== undefined) {
      const max = c.clearanceLimitedMax;
      if (p.skirtDepth > max + 1e-6) p.skirtDepth = Math.round(max * 10) / 10;
    }
    const prev = this.params;
    this.params = { ...this.params, ...p };
    this.baseline.applyParams(this.params);
    this.sweepline.applyParams(this.params);
    if (!opts.silent) {
      if (p.anchorAngle !== undefined && p.anchorAngle !== prev.anchorAngle) {
        this.log('info', `Anchor configuration ${p.anchorAngle}° selected (pre-engineered layout, ${this.sweepline.curtain!.length.toFixed(0)} m)`);
      }
      if (p.standbyEnabled !== undefined && p.standbyEnabled !== prev.standbyEnabled) {
        this.log(p.standbyEnabled ? 'info' : 'warn', p.standbyEnabled ? 'Standby transfer path armed' : 'Standby transfer path disarmed');
      }
      if (p.activeFlow !== undefined && p.activeFlow !== prev.activeFlow) {
        this.log(
          p.activeFlow ? 'info' : 'warn',
          p.activeFlow ? `Active flow jets on — ${Math.round(this.params.jetLevel * 100)}% output` : 'Active flow jets off — curtain running as a passive guide',
        );
      }
      if (p.jetLevel !== undefined && p.jetLevel !== prev.jetLevel && this.params.activeFlow) {
        if (this.jetLogTimer) clearTimeout(this.jetLogTimer);
        this.jetLogTimer = setTimeout(() => {
          const v = this.params.jetLevel * ASSUMPTIONS.jets.conveyorSpeed;
          this.log('info', `Jet output ${Math.round(this.params.jetLevel * 100)}% — conveyor ${v.toFixed(2)} m/s at the curtain face`);
        }, 700);
      }
      if (p.deployMode !== undefined && p.deployMode !== prev.deployMode) {
        this.log(
          'info',
          p.deployMode === 'popup'
            ? 'Deployment method: pop-up from the seabed (applies to the next deployment)'
            : 'Deployment method: workboat laying (applies to the next deployment)',
        );
      }
      if (p.skirtDepth !== undefined && p.skirtDepth !== prev.skirtDepth) {
        if (this.skirtLogTimer) clearTimeout(this.skirtLogTimer);
        this.skirtLogTimer = setTimeout(() => {
          this.log('info', `Skirt depth setpoint ${this.params.skirtDepth.toFixed(1)} m — winches adjusting`);
        }, 700);
      }
    }
    this.publish(true);
  }

  /** Changing seed or agent budget re-seeds the bloom, so it restarts the run. */
  async reseed(seed: number, budget: number): Promise<void> {
    this.params = { ...this.params, seed: Math.max(1, Math.floor(seed)), agentBudget: budget };
    await this.restart('sequence', this.scenario);
  }

  // ------------------------------------------------------------------ operator commands

  deploy(source: 'auto' | 'manual' = 'manual'): boolean {
    const c = this.sweepline.curtain!;
    const tr = this.sweepline.transfer!;
    if (c.mode !== 'STOWED') return false;
    if (!this.envelope.deployPermitted) {
      if (source === 'manual') {
        const reasons = [...this.envelope.hardViolations, ...this.envelope.advisories.filter((a) => a.status === 'out')]
          .map((v) => `${v.label} ${v.value}`)
          .join(', ');
        this.log('alarm', `Deployment rejected — outside validated operating envelope (${reasons || 'transfer path unavailable'})`);
      }
      return false;
    }
    c.deploy(this.params.deployMode);
    this.deployCount++;
    tr.throatOpen = true;
    tr.acceptingNew = true;
    this.safeOpen.reset();
    this.standDown = false;
    this.timeline.find((s) => s.key === 'deploy')!.at = this.simTime;
    this.timeline.find((s) => s.key === 'recovery')!.at = null;
    if (this.params.deployMode === 'popup') {
      this.log(
        'info',
        `Pop-up deployment started — ${this.params.anchorAngle}° anchor layout, ${c.length.toFixed(0)} m curtain, skirt ${this.params.skirtDepth.toFixed(1)} m (no vessel needed)`,
      );
    } else {
      this.log('info', `Workboat deployment requested — crew and vessel mobilising (~${Math.round(ASSUMPTIONS.deploy.workboatMobilisation / 60)} min, assumption)`);
    }
    return true;
  }

  initiateSafeOpen(reason = 'Operator command'): boolean {
    const ok = this.safeOpen.initiate(this.sweepline, reason, (l, m) => this.log(l, m));
    this.publish(true);
    return ok;
  }

  /** Re-engage after SafeOpen (downstream-first) or deploy from stowed. */
  rearm(): boolean {
    const c = this.sweepline.curtain!;
    const tr = this.sweepline.transfer!;
    if (c.mode === 'STOWED') return this.deploy('manual');
    if (!this.safeOpen.complete && c.mode !== 'REEFED') return false;
    if (!this.envelope.deployPermitted) {
      this.log('alarm', 'Re-arm rejected — conditions outside validated operating envelope');
      return false;
    }
    if (!tr.poweredPathAvailable) {
      this.log('alarm', 'Re-arm rejected — no powered transfer path available');
      return false;
    }
    c.unreef();
    tr.throatOpen = true;
    tr.acceptingNew = true;
    this.safeOpen.reset();
    this.dwell = {};
    this.timeline.find((s) => s.key === 'recovery')!.at = null;
    this.log('ok', 'SweepLine re-armed — downstream-first re-engagement');
    this.publish(true);
    return true;
  }

  /** Reel a reefed (or idle deployed) curtain back onto the throat-side reel. */
  stowCurtain(): boolean {
    const c = this.sweepline.curtain!;
    if (this.safeOpen.active) return false;
    if (c.mode !== 'REEFED' && c.mode !== 'DEPLOYED') return false;
    if (c.mode === 'DEPLOYED') {
      // A deployed curtain is always disengaged upstream-first before it is stowed.
      return this.initiateSafeOpen('Planned retraction');
    }
    c.stow();
    this.standDown = true;
    this.log(
      'info',
      c.deployMode === 'popup'
        ? 'Curtain stowing — deflating back to the seabed from the upstream anchor (auto-deploy suspended)'
        : 'Curtain stowing — reeling in from the upstream anchor (auto-deploy suspended)',
    );
    this.publish(true);
    return true;
  }

  /**
   * Select a pre-engineered anchor layout. The angle can never change while the
   * curtain is deployed: a new layout means a fresh deployment, so the run restarts
   * (same seed) and the curtain is laid on the newly selected anchors.
   */
  async selectAnchorLayout(angle: AnchorAngle): Promise<'applied' | 'restarted'> {
    if (this.sweepline.curtain!.mode === 'STOWED') {
      this.setParams({ anchorAngle: angle });
      return 'applied';
    }
    this.params = { ...this.params, anchorAngle: angle };
    // A manual layout change is a custom run: keep the conditions, drop any scripted failures.
    await this.restart('sequence', null);
    this.log('info', `Anchor configuration ${angle}° selected — redeploying on the pre-engineered anchors`);
    return 'restarted';
  }

  endBloom(): void {
    this.baseline.bloomActive = false;
    this.sweepline.bloomActive = false;
    this.log('info', 'Bloom passage ending — no new arrivals upstream');
    this.publish(true);
  }

  // ------------------------------------------------------------------ failure injection

  injectFailure(key: FailureKey): void {
    if (this.failures[key]) return;
    const s = this.sweepline;
    const tr = s.transfer!;
    switch (key) {
      case 'transferPrimary':
        tr.primaryFault = true;
        break;
      case 'transferStandby':
        tr.standbyFault = true;
        break;
      case 'extremeCurrent':
        this.savedParams.currentSpeed ??= this.params.currentSpeed;
        this.setParams({ currentSpeed: 0.78 }, { silent: true });
        break;
      case 'deepBloom':
        this.savedParams.bloomMeanDepth ??= this.params.bloomMeanDepth;
        this.savedParams.bloomDepthSD ??= this.params.bloomDepthSD;
        this.setParams({ bloomMeanDepth: 3.6, bloomDepthSD: 0.5 }, { silent: true });
        break;
      case 'highDensity': {
        this.savedParams.bloomDensity ??= this.params.bloomDensity;
        this.setParams({ bloomDensity: 1.0 }, { silent: true });
        const surge = Math.round(this.params.agentBudget * 0.25);
        this.baseline.spawnSurge(surge);
        this.sweepline.spawnSurge(surge);
        break;
      }
      case 'curtainOverload':
        s.debrisTarget = 0.95;
        break;
      case 'highWaves':
        this.savedParams.waveHeight ??= this.params.waveHeight;
        this.setParams({ waveHeight: 1.9 }, { silent: true });
        break;
    }
    this.failures = { ...this.failures, [key]: true };
    const msg: Record<FailureKey, [EventLevel, string]> = {
      transferPrimary: ['info', 'Failure injected — primary transfer module'],
      transferStandby: ['info', 'Failure injected — standby transfer module'],
      extremeCurrent: ['warn', 'Stress test: extreme current 0.78 m/s'],
      deepBloom: ['warn', 'Stress test: deep bloom — mean depth 3.6 m'],
      highDensity: ['warn', 'Stress test: bloom surge — density 100%'],
      curtainOverload: ['warn', 'Stress test: curtain overload — debris and bio-fouling accumulation'],
      highWaves: ['warn', 'Stress test: high wave state — Hs 1.9 m'],
    };
    this.log(msg[key][0], msg[key][1]);
    this.publish(true);
  }

  clearFailure(key: FailureKey): void {
    if (!this.failures[key]) return;
    const s = this.sweepline;
    const tr = s.transfer!;
    switch (key) {
      case 'transferPrimary':
        tr.primaryFault = false;
        break;
      case 'transferStandby':
        tr.standbyFault = false;
        break;
      case 'extremeCurrent':
        this.restoreSaved(['currentSpeed']);
        break;
      case 'deepBloom':
        this.restoreSaved(['bloomMeanDepth', 'bloomDepthSD']);
        break;
      case 'highDensity':
        this.restoreSaved(['bloomDensity']);
        break;
      case 'curtainOverload':
        s.debrisTarget = 0;
        break;
      case 'highWaves':
        this.restoreSaved(['waveHeight']);
        break;
    }
    this.failures = { ...this.failures, [key]: false };
    this.log('ok', `${FAILURE_LABELS[key]} cleared`);
    this.publish(true);
  }

  clearAllFailures(): void {
    (Object.keys(this.failures) as FailureKey[]).forEach((k) => this.clearFailure(k));
  }

  private restoreSaved(keys: Array<keyof SimParams>): void {
    const p: Partial<SimParams> = {};
    for (const k of keys) {
      if (this.savedParams[k] !== undefined) {
        (p as Record<string, unknown>)[k] = this.savedParams[k];
        delete this.savedParams[k];
      }
    }
    this.setParams(p, { silent: true });
  }

  // ------------------------------------------------------------------ selection

  select(engine: EngineKind, agentId: number | null): void {
    this.selection = agentId === null ? null : { engine, agentId };
    this.publish(true);
  }

  // ------------------------------------------------------------------ stepping

  /** Advance by real elapsed seconds. */
  frame(dtReal: number): void {
    if (this.ready && !this.paused) {
      const h = ASSUMPTIONS.timeStep;
      this.acc += Math.min(dtReal, 0.1) * this.speed;
      let n = 0;
      while (this.acc >= h && n < 40) {
        this.stepAll(h);
        this.acc -= h;
        n++;
      }
      if (n >= 40) this.acc = 0;
    }
    this.publish(false);
  }

  private stepAll(dt: number): void {
    const s = this.sweepline;
    this.baseline.step(dt);
    s.step(dt);
    const t = s.time;
    const c = s.curtain!;
    const tr = s.transfer!;

    if (this.warningAt === null && t >= ASSUMPTIONS.sequence.warningAt && s.bloomActive) {
      this.warningAt = t;
      this.stage('warning');
      const p90 = this.params.bloomMeanDepth + 1.2816 * this.params.bloomDepthSD;
      this.log('warn', `Early warning received — bloom approaching intake (density ${(this.params.bloomDensity * 100).toFixed(0)}%, P90 depth ${p90.toFixed(1)} m)`);
    }

    // Transfer path transitions.
    const ps = tr.primaryStatus;
    const ss = tr.standbyStatus;
    if (ps !== this.prevPrimary) {
      if (ps === 'FAULT') this.log('alarm', 'Primary transfer FAULT — throughput lost');
      else if (this.prevPrimary === 'FAULT') this.log('ok', 'Primary transfer restored');
      this.prevPrimary = ps;
    }
    if (ss !== this.prevStandby) {
      if (ss === 'ACTIVATING') this.log('warn', 'Standby transfer activating');
      else if (ss === 'ONLINE') this.log('ok', 'Standby transfer online — capacity restored');
      else if (ss === 'FAULT') this.log('alarm', tr.primaryFault ? 'Standby transfer unavailable' : 'Standby transfer fault — no redundancy');
      else if (ss === 'DISABLED' && tr.primaryFault) this.log('alarm', 'Standby transfer unavailable (not armed)');
      this.prevStandby = ss;
    }

    // Curtain mode transitions.
    if (c.mode !== this.prevCurtainMode) {
      if (c.mode === 'DEPLOYED' && this.prevCurtainMode === 'DEPLOYING') {
        this.log('ok', `SweepLine active — curtain fully deployed, skirt ${c.skirtActual.toFixed(1)} m`);
        if (this.stageAt('sweep') === null) this.stage('sweep');
      }
      if (c.mode === 'DEPLOYED' && this.prevCurtainMode === 'UNREEFING') this.log('ok', 'Curtain re-engaged — SweepLine active');
      if (c.mode === 'STOWED' && this.prevCurtainMode === 'STOWING') {
        tr.throatOpen = false;
        tr.acceptingNew = true;
        this.safeOpen.reset();
        this.envOkFor = 0;
        this.log('ok', 'Curtain stowed — system returned to standby');
        this.stage('recovery');
      }
      this.prevCurtainMode = c.mode;
    }
    if (c.mode === 'DEPLOYING') {
      if (c.deployDelay <= 0 && !this.flag(`front${this.deployCount}`)) {
        this.log('info', c.deployMode === 'popup' ? 'Float line inflating — curtain rising from the throat end' : 'Workboat on station — laying the curtain from the throat end');
      }
      const pct = Math.floor(c.deployedFraction * 4) * 25;
      if (pct === 50 && !this.flag('laid50')) this.log('info', `Curtain 50% ${c.deployMode === 'popup' ? 'risen' : 'laid'} — throat section guiding`);
    }
    // Active flow reports once it reaches the commanded output.
    if (c.jetTarget > 0 && c.activeCount > 0 && c.jetOutput >= c.jetTarget * 0.9 && !this.flag(`jets${this.deployCount}`)) {
      this.log('ok', `Active flow running — conveyor jets ${(c.jetTarget * ASSUMPTIONS.jets.conveyorSpeed).toFixed(2)} m/s along the face, foot jets lifting at the skirt edge`);
    }

    this.safeOpen.update(s, (l, m) => this.log(l, m));
    if (this.safeOpen.complete && this.stageAt('recovery') === null) this.stage('recovery');

    if (this.stageAt('sweep') !== null && this.stageAt('transfer') === null && s.counters.transferred > 0) {
      this.stage('transfer');
      this.log('info', 'First jellyfish entered recovery throat — low-shear transfer running');
    }
    if (this.stageAt('transfer') !== null && this.stageAt('release') === null && s.counters.released > 0) {
      this.stage('release');
      this.log('ok', `First jellyfish released alive down-current (${this.params.releaseDistance} m line, simulation assumption)`);
    }

    this.safetyTimer += dt;
    if (this.safetyTimer >= 0.5) {
      this.safetyUpdate(this.safetyTimer);
      this.safetyTimer = 0;
    }

    this.stowCheckTimer += dt;
    if (this.stowCheckTimer >= 2) {
      this.stowCheckTimer = 0;
      if (!s.bloomActive && c.mode === 'DEPLOYED' && !this.safeOpen.active) {
        const pending = s.countState(S_APPROACHING) + s.countState(S_GUIDED) + s.countState(S_TRANSFER_QUEUE);
        if (pending === 0) {
          c.stow();
          this.log('info', 'Bloom passed — curtain stowing');
        }
      }
    }

    // Scenario script.
    while (this.script.length > 0 && t - this.runStart >= this.script[0].at) {
      const step = this.script.shift()!;
      const a = step.action;
      if (a.kind === 'fail') this.injectFailure(a.failure);
      else if (a.kind === 'clear') this.clearFailure(a.failure);
      else {
        this.setParams(a.params, { silent: true });
        this.log('warn', a.message);
      }
    }

    this.historyTimer += dt;
    if (this.historyTimer >= 2) {
      this.historyTimer = 0;
      this.sampleHistory();
    }
  }

  private flags = new Set<string>();
  private flag(key: string): boolean {
    if (this.flags.has(`${this.runToken}:${key}`)) return true;
    this.flags.add(`${this.runToken}:${key}`);
    return false;
  }

  private safetyUpdate(dt: number): void {
    const s = this.sweepline;
    const c = s.curtain!;
    const tr = s.transfer!;
    const m = computeEngineMetrics(s);
    const deployed = c.mode === 'DEPLOYING' || c.mode === 'DEPLOYED' || c.mode === 'UNREEFING';
    const env = evaluateEnvelope(this.params, s, m, deployed || this.safeOpen.active, this.safeOpen.active, this.safeOpen.complete);
    this.envelope = env;

    // Auto-deployment after the early warning, only inside the envelope.
    if (c.mode === 'STOWED' && this.warningAt !== null && s.bloomActive && this.params.autoDeploy && !this.safeOpen.complete && !this.standDown) {
      if (env.deployPermitted) {
        this.envOkFor += dt;
        if (this.deployBlockLogged) {
          this.log('ok', 'Conditions within assumed envelope — deployment permitted');
          this.deployBlockLogged = false;
        }
        if (this.envOkFor >= ASSUMPTIONS.sequence.deployConfirm) this.deploy('auto');
      } else {
        this.envOkFor = 0;
        if (!this.deployBlockLogged) {
          const reasons = [...env.hardViolations, ...env.advisories.filter((a) => a.status === 'out')].map((v) => `${v.label} ${v.value}`);
          this.log('alarm', `OUTSIDE VALIDATED OPERATING ENVELOPE — deployment not recommended (${reasons.join(', ') || 'transfer path unavailable'})`);
          this.deployBlockLogged = true;
        }
      }
    }

    if (deployed && !this.safeOpen.active) {
      // Loss of all powered transfer paths → SafeOpen (after a short confirmation delay).
      if (tr.primaryFault && !tr.poweredPathAvailable) {
        this.transferLossFor += dt;
        if (this.transferLossFor >= ASSUMPTIONS.safeOpen.transferLossDelay) {
          this.safeOpen.initiate(s, 'transfer capacity lost, standby unavailable', (l, msg) => this.log(l, msg));
          this.transferLossFor = 0;
        }
      } else this.transferLossFor = 0;

      // Hard envelope limits held beyond the dwell time → automatic SafeOpen.
      const violated = new Set(env.hardViolations.filter((v) => v.key !== 'transferPath').map((v) => v.key));
      for (const k of Object.keys(this.dwell)) if (!violated.has(k as never)) delete this.dwell[k];
      for (const v of env.hardViolations) {
        if (v.key === 'transferPath') continue;
        this.dwell[v.key] = (this.dwell[v.key] ?? 0) + dt;
        if (this.dwell[v.key] >= ASSUMPTIONS.safeOpen.violationDwell && !this.safeOpen.active) {
          this.log('alarm', `OUTSIDE VALIDATED OPERATING ENVELOPE — ${v.label} ${v.value} (limit ${v.limit})`);
          this.safeOpen.initiate(s, `${v.label} outside envelope`, (l, msg) => this.log(l, msg));
          this.dwell = {};
          break;
        }
      }
    }
  }

  private stage(key: StageKey): void {
    const st = this.timeline.find((s) => s.key === key)!;
    if (st.at === null) st.at = this.simTime;
  }

  private stageAt(key: StageKey): number | null {
    return this.timeline.find((s) => s.key === key)!.at;
  }

  private currentStage(): StageKey {
    let cur: StageKey = 'bloom';
    for (const s of this.timeline) if (s.at !== null) cur = s.key;
    return cur;
  }

  private sampleHistory(): void {
    const b = computeEngineMetrics(this.baseline);
    const m = computeEngineMetrics(this.sweepline);
    this.history.push({
      t: this.simTime,
      bContacts: b.intakeContacts,
      sContacts: m.intakeContacts,
      bRate: b.intakeRatePerMin,
      sRate: m.intakeRatePerMin,
      bPct: b.intakeContactPct,
      sPct: m.intakeContactPct,
      diverted: m.diverted,
      underSkirt: m.underSkirt,
      underPct: m.underSkirtPct,
      efficiency: m.diversionEfficiency,
      utilisation: m.transferUtilisation,
      load: m.curtainLoad,
      occupancy: m.throatOccupancy,
      contactTime: m.avgContactTime,
      guided: m.guided,
      transferred: m.transferred,
      released: m.released,
      flow: m.transferFlowM3h * (m.transferUtilisation ?? 0),
    });
    if (this.history.length > 5400) this.history.splice(0, this.history.length - 5400);
    this.historyVersion++;
  }

  log(level: EventLevel, message: string): void {
    this.events.push({ id: this.eventId++, t: this.simTime, level, message });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  computeStatus(): SystemStatus {
    const c = this.sweepline.curtain!;
    const env = this.envelope;
    const so = this.safeOpen;
    if (so.active) return { code: 'SAFEOPEN', label: 'SafeOpen', detail: PHASE_LABELS[so.state.phase], tone: 'alarm' };
    if (so.complete) return { code: 'BASELINE_RESTORED', label: 'Baseline protection', detail: 'SweepLine reefed — existing intake screens active', tone: 'warn' };
    if (c.mode === 'STOWED') {
      if (this.warningAt !== null && this.sweepline.bloomActive && !env.deployPermitted)
        return { code: 'OUTSIDE_ENVELOPE', label: 'Outside envelope', detail: 'Deployment not recommended', tone: 'alarm' };
      if (this.warningAt !== null && this.sweepline.bloomActive)
        return this.standDown
          ? { code: 'STANDBY', label: 'Stood down', detail: 'Curtain stowed by operator — deploy when ready', tone: 'info' }
          : { code: 'WARNING', label: 'Warning received', detail: 'Preparing deployment', tone: 'warn' };
      return { code: 'READY', label: 'Ready', detail: 'SweepLine stowed — awaiting early warning', tone: 'ok' };
    }
    if (c.mode === 'DEPLOYING') {
      if (c.deployDelay > 0)
        return c.deployMode === 'workboat'
          ? { code: 'DEPLOYING', label: 'Mobilising', detail: `Workboat on station in ${formatDuration(c.deployDelay)}`, tone: 'info' }
          : { code: 'DEPLOYING', label: 'Deploying', detail: 'Pop-up: inflating float line', tone: 'info' };
      return { code: 'DEPLOYING', label: 'Deploying', detail: `Curtain ${(c.deployedFraction * 100).toFixed(0)}% ${c.deployMode === 'popup' ? 'risen' : 'laid'}`, tone: 'info' };
    }
    if (c.mode === 'STOWING') return { code: 'STANDBY', label: 'Stowing', detail: 'Bloom passed — recovering curtain', tone: 'info' };
    if (c.mode === 'UNREEFING') return { code: 'DEPLOYING', label: 'Re-arming', detail: 'Downstream-first re-engagement', tone: 'info' };
    if (!env.within) return { code: 'OUTSIDE_ENVELOPE', label: 'Outside envelope', detail: 'SafeOpen recommended', tone: 'alarm' };
    const tr = this.sweepline.transfer!;
    if (tr.primaryFault) return { code: 'ELEVATED', label: 'Elevated', detail: tr.standbyStatus === 'ONLINE' ? 'Standby transfer carrying load' : 'Standby transfer activating', tone: 'warn' };
    const near = env.constraints.filter((k) => k.status === 'near');
    if (near.length > 0 || env.advisories.length > 0) {
      const first = env.advisories[0] ?? near[0];
      return { code: 'ELEVATED', label: 'Elevated', detail: `${first.label} ${first.value}`, tone: 'warn' };
    }
    return { code: 'NOMINAL', label: 'Nominal', detail: 'All systems nominal', tone: 'ok' };
  }

  buildSnapshot(): SimSnapshot {
    const s = this.sweepline;
    const c = s.curtain!;
    const tr = s.transfer!;
    let selectedAgent: SimSnapshot['selectedAgent'] = null;
    if (this.selection) {
      const e = this.engine(this.selection.engine);
      const slot = e.pool.findById(this.selection.agentId);
      const info = slot >= 0 ? e.agentInfo(slot) : null;
      if (info) selectedAgent = { ...info, engine: this.selection.engine };
    }
    let underSeq = 0;
    for (const mk of s.markers) if (mk.kind === 'under') underSeq++;
    return {
      ready: this.ready,
      simTime: s.time,
      clockMs: this.clockStart + s.time * 1000,
      speed: this.speed,
      paused: this.paused,
      params: { ...this.params },
      scenarioId: this.scenario?.id ?? null,
      scenarioName: this.scenario?.name ?? (this.isReferenceRun() ? 'Reference conditions' : 'Custom conditions'),
      baseline: computeEngineMetrics(this.baseline),
      sweepline: computeEngineMetrics(s),
      status: this.computeStatus(),
      curtain: {
        mode: c.mode,
        deployedPct: c.deployedFraction * 100,
        reefedPct: c.reefedFraction * 100,
        angle: c.layout.angle,
        length: c.length,
        skirtActual: c.skirtActual,
        skirtTarget: c.skirtTarget,
        attackAngle: s.flow.attackAngle(c.layout.angle, this.params.currentBearing),
        liftAngle: c.liftAngleDeg,
        normalVelocity: c.normalVelocity,
        activeFraction: c.activeCount / c.layout.segCount,
        clearanceMax: c.clearanceLimitedMax,
        jetOutput: c.jetOutput,
        jetConveyor: c.jetOutput * ASSUMPTIONS.jets.conveyorSpeed,
        jetFlowM3s: c.jetOutput * ASSUMPTIONS.jets.designFlowM3s,
        jetPowerKW: c.jetOutput ** 3 * ASSUMPTIONS.jets.designPowerKW,
        deployMode: c.deployMode,
        deployDelay: c.deployDelay,
      },
      transfer: {
        primary: tr.primaryStatus,
        standby: tr.standbyStatus,
        standbyEnabled: tr.standbyEnabled,
        path: tr.activePath,
        availability: tr.availability(),
        flowM3h: tr.flowM3h(),
        capacityPerMin: tr.capacityRate() * 60,
        queue: tr.queue.length,
        holdCapacity: s.holdCapacity,
      },
      safeOpen: {
        phase: this.safeOpen.state.phase,
        reason: this.safeOpen.state.reason,
        elapsed: this.safeOpen.state.phase === 'IDLE' ? 0 : s.time - this.safeOpen.state.startedAt,
      },
      envelope: this.envelope,
      timeline: this.timeline.map((x) => ({ ...x })),
      stage: this.currentStage(),
      events: this.events.slice(-80),
      failures: { ...this.failures },
      bloom: {
        p50: this.params.bloomMeanDepth,
        p90: this.params.bloomMeanDepth + 1.2816 * this.params.bloomDepthSD,
        active: s.bloomActive,
        arrivalsPerMin: s.spawnRate() * 60,
        warningAt: this.warningAt,
      },
      selectedAgent,
      underSkirtSeq: s.counters.underSkirt,
    };
  }

  /** True while the run uses the reference (default) parameters. */
  private isReferenceRun(): boolean {
    return (Object.keys(DEFAULT_PARAMS) as Array<keyof SimParams>).every((k) => k === 'seed' || k === 'agentBudget' || this.params[k] === DEFAULT_PARAMS[k]);
  }

  private publish(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < 125) return;
    this.lastPublish = now;
    this.publisher?.(this.buildSnapshot());
  }

  // ------------------------------------------------------------------ export

  exportRun(): object {
    const b = computeEngineMetrics(this.baseline);
    const m = computeEngineMetrics(this.sweepline);
    const reduction =
      b.intakeContactPct !== null && m.intakeContactPct !== null && b.intakeContactPct > 0
        ? 1 - m.intakeContactPct / b.intakeContactPct
        : null;
    const step = Math.max(1, Math.ceil(this.history.length / 600));
    return {
      application: 'SweepLine — Adaptive Live Jellyfish Bypass Visualiser',
      notice: [
        'Engineering design visualiser. Performance values are simulation estimates and are not field-validated.',
        'Reference coastal intake geometry is schematic and does not represent confidential or exact ENEC facility design.',
        'Agent-based engineering simulation — not validated field performance.',
      ],
      exportedAt: new Date().toISOString(),
      scenario: this.scenario
        ? { id: this.scenario.id, name: this.scenario.name }
        : { id: null, name: this.isReferenceRun() ? 'Reference conditions' : 'Custom conditions' },
      seed: this.params.seed,
      simulatedSeconds: Math.round(this.simTime),
      parameters: this.params,
      assumptions: ASSUMPTIONS,
      operatingEnvelope: OPERATING_ENVELOPE,
      metrics: { baseline: b, sweepline: m },
      comparison: {
        sameSeed: true,
        baselineIntakeContactPct: b.intakeContactPct,
        sweeplineIntakeContactPct: m.intakeContactPct,
        intakeContactReduction: reduction,
        label: 'Simulation estimate',
      },
      failures: {
        active: Object.entries(this.failures)
          .filter(([, v]) => v)
          .map(([k]) => k),
      },
      safeOpen: this.safeOpen.state,
      envelope: {
        within: this.envelope.within,
        satisfied: this.envelope.satisfied,
        total: this.envelope.total,
        recommendation: this.envelope.recommendation,
        constraints: this.envelope.constraints,
      },
      timeline: this.timeline,
      events: this.events.map((e) => ({ ...e, clock: new Date(this.clockStart + e.t * 1000).toISOString() })),
      result: {
        status: this.computeStatus(),
        curtainMode: this.sweepline.curtain!.mode,
      },
      history: this.history.filter((_, i) => i % step === 0),
    };
  }

  exportCsv(): string {
    const cols: Array<keyof HistorySample> = [
      't',
      'bContacts',
      'sContacts',
      'bRate',
      'sRate',
      'bPct',
      'sPct',
      'diverted',
      'underSkirt',
      'underPct',
      'efficiency',
      'utilisation',
      'load',
      'occupancy',
      'contactTime',
      'guided',
      'transferred',
      'released',
      'flow',
    ];
    const header = [
      'sim_time_s',
      'baseline_intake_contacts',
      'sweepline_intake_contacts',
      'baseline_contact_rate_per_min',
      'sweepline_contact_rate_per_min',
      'baseline_intake_contact_pct',
      'sweepline_intake_contact_pct',
      'diverted',
      'under_skirt',
      'under_skirt_pct',
      'diversion_efficiency',
      'transfer_utilisation',
      'curtain_load',
      'throat_occupancy',
      'avg_contact_time_s',
      'guided',
      'transferred',
      'released',
      'transfer_flow_m3h',
    ];
    const rows = this.history.map((h) =>
      cols
        .map((c) => {
          const v = h[c];
          return v === null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v);
        })
        .join(','),
    );
    return [`# SweepLine simulation estimate — seed ${this.params.seed} — not field-validated`, header.join(','), ...rows].join('\n');
  }
}

export const PHASE_LABELS: Record<SafeOpenPhase, string> = {
  IDLE: 'Idle',
  INITIATED: 'SafeOpen initiated — stop accepting new traffic',
  UPSTREAM_REEF: 'Upstream reef in progress',
  CLEARING: 'Existing SweepLine traffic clearing',
  PROGRESSIVE_REEF: 'Progressive reef of remaining curtain',
  THROAT_CLEAR: 'Throat clearing',
  COMPLETE: 'Baseline intake protection restored',
};

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Application-wide controller instance. */
export const controller = new SimController();
