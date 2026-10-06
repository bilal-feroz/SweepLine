/**
 * Headless calibration harness for the agent model.
 * Runs baseline and SweepLine engines side by side with the same seed and
 * prints the derived metrics. Usage: npm run calibrate -- [key=value ...]
 */
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { computeEngineMetrics } from '../src/simulation/metrics';
import { DEFAULT_PARAMS, type SimParams } from '../src/simulation/types';

const overrides: Record<string, number | string | boolean> = {};
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  if (!k || !v) continue;
  if (v === 'true' || v === 'false') overrides[k] = v === 'true';
  else overrides[k] = Number.isFinite(Number(v)) ? Number(v) : v;
}
const minutes = Number(overrides.minutes ?? 40);
delete overrides.minutes;
const params: SimParams = { ...DEFAULT_PARAMS, ...overrides } as SimParams;

const base = new SimulationEngine('baseline', params);
const sweep = new SimulationEngine('sweepline', params);
base.reset(params, 'approach');
sweep.reset(params, 'approach');
sweep.curtain!.deploy(params.deployMode);
sweep.transfer!.throatOpen = true;

const dt = 0.1;
const t0 = performance.now();
const steps = Math.round((minutes * 60) / dt);
const pct = (v: number | null) => (v === null ? '  —  ' : `${(v * 100).toFixed(1)}%`);
for (let s = 1; s <= steps; s++) {
  base.step(dt);
  sweep.step(dt);
  if (s % Math.round(300 / dt) === 0) {
    const b = computeEngineMetrics(base);
    const m = computeEngineMetrics(sweep);
    console.log(
      `t=${(sweep.time / 60).toFixed(0).padStart(3)}min | base contact ${pct(b.intakeContactPct)} (${b.intakeContacts}) rate ${b.intakeRatePerMin.toFixed(2)}/min ${b.screenLoad}` +
        ` | sweep contact ${pct(m.intakeContactPct)} (${m.intakeContacts}) div ${pct(m.diversionEfficiency)} under ${pct(m.underSkirtPct)} ` +
        `guided ${m.guided} queue ${m.throatQueue}/${sweep.holdCapacity} util ${pct(m.transferUtilisation)} load ${(m.curtainLoad * 100).toFixed(0)}% ` +
        `contact ${m.avgContactTime?.toFixed(0)}s xfer ${m.transferred} rel ${m.released} active ${b.active}/${m.active} ${sweep.curtain!.mode} jets ${(sweep.curtain!.jetOutput * 100).toFixed(0)}%`,
    );
  }
}
const ms = performance.now() - t0;
console.log(`\n${steps} steps × 2 engines in ${ms.toFixed(0)} ms (${((ms / steps) * 1000).toFixed(1)} µs/step-pair)`);
console.log('counters sweep', sweep.counters);
console.log('counters base ', base.counters);
