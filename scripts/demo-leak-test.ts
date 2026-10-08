/**
 * Demo rule check: in the reference run, no more than DEMO_MAX_LEAKED jellyfish are
 * ever on the protected (shore) side of SweepLine at once — the zone between the
 * curtain and the revetment, through to the intake. Outcomes are computed by the
 * agent model as usual; this guards the reference parameters. Both starts are checked:
 * from the bloom approach (how the app opens, and Replay) and after the steady pre-roll.
 *
 *   npm run test:demo              # 60 simulated minutes each
 *   npm run test:demo -- minutes=120
 */
import { SITE } from '../src/config/site';
import { S_GUIDED, S_INACTIVE, S_TRANSFER_QUEUE, S_TRANSFERRED } from '../src/simulation/Agent';
import { controller } from '../src/simulation/SimController';

const DEMO_MAX_LEAKED = 5;
const minutes = Number(process.argv.find((a) => a.startsWith('minutes='))?.split('=')[1] ?? 60);

controller.setPublisher(() => {}, () => {});

async function check(start: 'sequence' | 'steady'): Promise<boolean> {
  await controller.restart(start, null);
  const engine = controller.sweepline;
  const L = engine.curtain!.layout;

  /** Curtain z at x along the layout, or null outside its extent. */
  const curtainZ = (x: number): number | null => {
    for (let i = 1; i < L.n; i++) {
      const a = L.px[i - 1];
      const b = L.px[i];
      if ((x >= a && x <= b) || (x >= b && x <= a)) return L.pz[i - 1] + (L.pz[i] - L.pz[i - 1]) * ((x - a) / (b - a || 1));
    }
    return null;
  };

  /** Shore side of the curtain, or between the throat end and the intake. */
  const onShoreSide = (x: number, z: number): boolean => {
    if (x < L.upstream.x) return false;
    const cz = curtainZ(x);
    if (cz !== null && x <= L.end.x) return z < cz;
    return x <= SITE.intake.x1 + 15 && z < L.end.z;
  };

  let max = 0;
  let sum = 0;
  let samples = 0;
  const p = engine.pool;
  for (let t = 0; t < minutes * 60; t += 2) {
    for (let k = 0; k < 4; k++) controller.frame(0.1); // 2 s simulated at 5x
    let n = 0;
    for (let i = 0; i < p.capacity; i++) {
      const st = p.state[i];
      if (st === S_INACTIVE || st === S_TRANSFERRED || st === S_TRANSFER_QUEUE || st === S_GUIDED) continue;
      if (onShoreSide(p.px[i], p.pz[i])) n++;
    }
    max = Math.max(max, n);
    sum += n;
    samples++;
  }
  const c = engine.counters;
  const status = controller.computeStatus().code;
  console.log(
    `${start}, ${minutes} min: shore-side jellyfish mean ${(sum / samples).toFixed(1)}, max ${max} (limit ${DEMO_MAX_LEAKED}) · under-skirt ${c.underSkirt}/${c.encountered} · intake contacts ${c.intakeContacts} vs baseline ${controller.baseline.counters.intakeContacts} · status ${status}`,
  );
  return max <= DEMO_MAX_LEAKED && status === 'NOMINAL';
}

const ok = [await check('sequence'), await check('steady')];
if (ok.includes(false)) {
  console.error('FAIL: the reference demo run exceeds the shore-side leak limit or is not nominal');
  process.exit(1);
}
console.log('PASS');
