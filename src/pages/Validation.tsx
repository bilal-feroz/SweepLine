import { CheckCircle2, CircleDashed, Clock3, FlaskRound, XCircle } from 'lucide-react';
import { useSnap } from '../app/hooks';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { cn, mmss, pct } from '../utils/format';

type Status = 'BUILT' | 'PENDING' | 'FUTURE';

const STATUS: Array<{ item: string; status: Status; detail: string }> = [
  { item: 'Design visualiser', status: 'BUILT', detail: 'This application: reference geometry, 3D digital twin, scenarios, export.' },
  { item: 'Agent simulation', status: 'BUILT', detail: 'Seeded agent-based model with baseline comparison; assumptions in config.' },
  { item: 'Flume calibration', status: 'PENDING', detail: 'Scaled curtain in a recirculating flume to calibrate guidance and entrainment.' },
  { item: 'Live Blue Blubber tests', status: 'PENDING', detail: 'Live Catostylus mosaicus trials for contact behaviour and bell damage.' },
  { item: 'Coastal pilot', status: 'FUTURE', detail: 'Short pilot deployment at a coastal intake under permits and monitoring.' },
];

const TESTS: Array<{ name: string; params: string; measures: string; calibrates: string; facility: string; status: Status }> = [
  { name: 'Angle test', params: '15° · 20° · 25°', measures: 'Guidance fraction, sweep speed, normal load', calibrates: 'redirectGain, loads.hydroWeight', facility: 'Flume', status: 'PENDING' },
  { name: 'Skirt depth', params: '1.5 – 4.0 m (scaled)', measures: 'Interception vs depth, skirt blow-back', calibrates: 'liftCoefficient, relativeHeave', facility: 'Flume', status: 'PENDING' },
  { name: 'Current speed', params: '0.1 – 0.7 m/s', measures: 'Entrainment under skirt, failure onset', calibrates: 'entrainmentGain, envelope.currentSpeed', facility: 'Flume', status: 'PENDING' },
  { name: 'Bloom density', params: 'Low → extreme', measures: 'Throat congestion, transfer throughput', calibrates: 'throat.holdCapacity, transfer.designRate', facility: 'Flume + tank', status: 'PENDING' },
  { name: 'Under-skirt rate', params: 'Depth distributions', measures: 'Escape probability by depth', calibrates: 'verticalNoise, verticalGain', facility: 'Flume', status: 'PENDING' },
  { name: 'Curtain contact time', params: 'Angle × speed', measures: 'Contact duration, behaviour at face', calibrates: 'interactionRange, minStandoff', facility: 'Flume + live', status: 'PENDING' },
  { name: 'Transfer damage', params: 'Ejector · screw · passive', measures: 'Bell damage, oral-arm loss', calibrates: 'Technology selection', facility: 'Live tests', status: 'PENDING' },
  { name: 'Post-transfer condition', params: '24 – 72 h holding', measures: 'Pulsation, recovery, survival', calibrates: 'Release viability', facility: 'Live tests', status: 'PENDING' },
  { name: 'SafeOpen reefing', params: 'Upstream-first sequence', measures: 'Reef timing, released traffic', calibrates: 'safeOpen.* speeds', facility: 'Pilot', status: 'FUTURE' },
];

function StatusChip({ s }: { s: Status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.06em]',
        s === 'BUILT' ? 'border-teal/40 bg-teal/10 text-teal' : s === 'PENDING' ? 'border-amber/40 bg-amber/10 text-amber' : 'border-line-strong bg-base/50 text-muted',
      )}
    >
      {s === 'BUILT' ? <CheckCircle2 size={11} /> : s === 'PENDING' ? <Clock3 size={11} /> : <CircleDashed size={11} />}
      {s}
    </span>
  );
}

export function Validation() {
  const snap = useSnap();
  const s = snap?.sweepline;
  const b = snap?.baseline;
  const reduction = b && s && b.intakeContactPct && s.intakeContactPct !== null ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const targets: Array<{ metric: string; target: string; sim: string }> = [
    { metric: 'Diversion efficiency', target: '≥ 80%', sim: pct(s?.diversionEfficiency ?? null) },
    { metric: 'Under-skirt escape', target: '≤ 10%', sim: pct(s?.underSkirtPct ?? null) },
    { metric: 'Intake contact reduction vs baseline', target: '≥ 70%', sim: reduction === null ? '—' : pct(reduction) },
    { metric: 'Average curtain contact time', target: '≤ 5 min', sim: s?.avgContactTime ? mmss(s.avgContactTime) : '—' },
    { metric: 'Bell damage after transfer', target: 'TBD with biologists', sim: 'Not modelled' },
    { metric: 'Post-transfer survival (72 h)', target: 'TBD with biologists', sim: 'Not modelled' },
    { metric: 'SafeOpen completion (fully reefed)', target: '≤ 10 min', sim: 'See SafeOpen scenario' },
  ];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
      <PageHeader eyebrow="Validation" title="What is validated — and what is not" subtitle="Nothing here has been field-validated. The visualiser and agent model are built; calibration and live testing are pending." />
      <div className="grid grid-cols-[1fr_1.3fr] gap-3">
        <Panel title="Current status" eyebrow="Programme">
          <div className="flex flex-col">
            {STATUS.map((r) => (
              <div key={r.item} className="flex items-start justify-between gap-3 border-b border-line/60 py-2.5 last:border-0">
                <div>
                  <div className="text-[13px] font-medium text-ink">{r.item}</div>
                  <div className="text-[11.5px] text-muted">{r.detail}</div>
                </div>
                <StatusChip s={r.status} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Development targets" eyebrow="Targets — not achieved metrics" actions={<span className="tag !text-amber">Development targets</span>}>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] tracking-[0.08em] text-muted uppercase">
                <th className="py-1.5 font-semibold">Metric</th>
                <th className="py-1.5 font-semibold">Development target</th>
                <th className="py-1.5 font-semibold">Simulation estimate</th>
                <th className="py-1.5 font-semibold">Validated</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.metric} className="border-b border-line/50">
                  <td className="py-1.5 text-ink-2">{t.metric}</td>
                  <td className="num py-1.5 text-ink">{t.target}</td>
                  <td className="num py-1.5 text-ink-2">{t.sim}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <XCircle size={12} /> Not yet
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-dim">Simulation estimates come from the live run (same seed as the baseline) and are not evidence of field performance.</p>
        </Panel>
      </div>
      <Panel title="Proposed test programme" eyebrow="Each test calibrates named model assumptions">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] tracking-[0.08em] text-muted uppercase">
              <th className="py-1.5 font-semibold">Test</th>
              <th className="py-1.5 font-semibold">Parameters</th>
              <th className="py-1.5 font-semibold">Measures</th>
              <th className="py-1.5 font-semibold">Calibrates (config)</th>
              <th className="py-1.5 font-semibold">Facility</th>
              <th className="py-1.5 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {TESTS.map((t) => (
              <tr key={t.name} className="border-b border-line/50">
                <td className="py-2 font-medium text-ink">
                  <span className="flex items-center gap-2">
                    <FlaskRound size={13} className="text-cyan" />
                    {t.name.toUpperCase()}
                  </span>
                </td>
                <td className="num py-2 text-ink-2">{t.params}</td>
                <td className="py-2 text-ink-2">{t.measures}</td>
                <td className="num py-2 text-[11px] text-muted">{t.calibrates}</td>
                <td className="py-2 text-ink-2">{t.facility}</td>
                <td className="py-2 text-right">
                  <StatusChip s={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="What this visualiser can tell you" eyebrow="Appropriate use">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-ink-2">
            <li>How an angled guide curtain converts incoming flow into lateral sweeping flow.</li>
            <li>Which design levers matter (angle, skirt depth, transfer capacity) and their trade-offs.</li>
            <li>How the fail-safe sequence behaves, and that existing protection is restored.</li>
            <li>Where the assumed operating envelope ends — and that SweepLine says so.</li>
          </ul>
        </Panel>
        <Panel title="What it cannot tell you" eyebrow="Limits">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-ink-2">
            <li>Validated field performance — the agent model is not CFD and is uncalibrated.</li>
            <li>Exact plant geometry — the reference coastal intake is schematic, not ENEC facility data.</li>
            <li>Jellyfish injury or survival — transfer damage is untested.</li>
            <li>Costs — the cost model requires UAE supplier quotations.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
