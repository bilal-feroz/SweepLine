/** Headless check of the controller timeline / safety sequencing. Usage: tsx scripts/scenario-test.ts <scenarioId> [minutes] */
import { controller, formatDuration } from '../src/simulation/SimController';

const id = process.argv[2] ?? 'normal';
const minutes = Number(process.argv[3] ?? 12);
let printed = 0;
controller.setPublisher(() => {}, () => {});
const t0 = performance.now();
await controller.runScenario(id);
console.log(`pre-roll/setup ${(performance.now() - t0).toFixed(0)} ms, sim t=${controller.simTime.toFixed(0)}s`);
controller.setSpeed(20);
const end = controller.simTime + minutes * 60;
while (controller.simTime < end) {
  controller.frame(0.1);
  for (; printed < controller.events.length; printed++) {
    const e = controller.events[printed];
    console.log(`${formatDuration(e.t).padStart(6)} [${e.level.padEnd(5)}] ${e.message}`);
  }
}
const s = controller.buildSnapshot();
console.log('\nstatus', s.status, '\nstage', s.stage, '\ncurtain', s.curtain.mode, 'reef', s.curtain.reefedPct.toFixed(0) + '%');
console.log('envelope', s.envelope.satisfied + '/' + s.envelope.total, s.envelope.recommendation);
console.log('base contact', s.baseline.intakeContactPct, 'sweep contact', s.sweepline.intakeContactPct, 'eff', s.sweepline.diversionEfficiency, 'under', s.sweepline.underSkirtPct, 'reefRel', s.sweepline.reefReleased);
