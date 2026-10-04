/** Headless lifecycle check: SafeOpen → stow → auto-redeploy → anchor change. */
import { controller, formatDuration } from '../src/simulation/SimController';

controller.setPublisher(() => {}, () => {});
let printed = 0;
const flush = () => {
  for (; printed < controller.events.length; printed++) {
    const e = controller.events[printed];
    console.log(`${formatDuration(e.t).padStart(6)} [${e.level.padEnd(5)}] ${e.message}`);
  }
};
const run = (seconds: number) => {
  const end = controller.simTime + seconds;
  while (controller.simTime < end) controller.frame(0.1);
  flush();
};
await controller.runScenario('safeopen');
controller.setSpeed(20);
printed = controller.events.length;
run(330);
console.log('--- after SafeOpen:', controller.sweepline.curtain!.mode, controller.computeStatus().label);
controller.clearAllFailures();
run(90);
console.log('stow:', controller.stowCurtain());
run(120);
console.log('--- after stow:', controller.sweepline.curtain!.mode, controller.computeStatus().label);
run(100);
console.log('--- later:', controller.sweepline.curtain!.mode, controller.computeStatus().label);
const r = await controller.selectAnchorLayout(15);
console.log('--- anchor change:', r, controller.sweepline.curtain!.layout.angle, controller.sweepline.curtain!.mode);
printed = 0;
run(120);
console.log('--- final:', controller.sweepline.curtain!.mode, controller.sweepline.curtain!.layout.angle, controller.computeStatus().label);
