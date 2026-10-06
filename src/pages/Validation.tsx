import {
  Anchor,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Cpu,
  FlaskRound,
  ListChecks,
  Search,
  Target,
  Waves,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { PageHeader } from '../components/layout/PageHeader';
import { Segmented } from '../components/ui/Controls';
import { Icon } from '../components/ui/icons';
import { IconTile, Panel, Pill, type TileTone } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { cn, mmss, pct } from '../utils/format';

type Status = 'BUILT' | 'PENDING' | 'FUTURE';

const STATUS_TONE: Record<Status, { tile: TileTone; pill: 'green' | 'amber' | 'muted'; icon: ReactNode }> = {
  BUILT: { tile: 'teal', pill: 'green', icon: <CheckCircle2 size={12} /> },
  PENDING: { tile: 'amber', pill: 'amber', icon: <Clock3 size={12} /> },
  FUTURE: { tile: 'blue', pill: 'muted', icon: <CircleDashed size={12} /> },
};

const STATUS: Array<{ item: string; status: Status; detail: string; icon: ReactNode }> = [
  { item: 'Design visualiser', status: 'BUILT', detail: 'This application: reference geometry, 3D digital twin, scenarios and export.', icon: <Box size={19} /> },
  { item: 'Agent simulation', status: 'BUILT', detail: 'Seeded agent-based model with a same-seed baseline; assumptions in config.', icon: <Cpu size={19} /> },
  { item: 'Flume calibration', status: 'PENDING', detail: 'Scaled curtain in a recirculating flume to calibrate guidance and entrainment.', icon: <Waves size={19} /> },
  { item: 'Live Blue Blubber tests', status: 'PENDING', detail: 'Live Catostylus mosaicus trials for contact behaviour and bell damage.', icon: <Icon name="jellyfish" size={20} /> },
  { item: 'Coastal pilot', status: 'FUTURE', detail: 'Short pilot deployment at a coastal intake under permits and monitoring.', icon: <Anchor size={19} /> },
];

interface Calibrated {
  key: string;
  value: string;
}

const A = ASSUMPTIONS;
const TESTS: Array<{ name: string; params: string; measures: string; calibrates: Calibrated[]; note?: string; facility: string; status: Status }> = [
  {
    name: 'Angle test',
    params: '15° · 20° · 25°',
    measures: 'Guidance fraction, sweep speed, normal load',
    calibrates: [
      { key: 'curtain.redirectGain', value: String(A.curtain.redirectGain) },
      { key: 'loads.hydroWeight', value: String(A.loads.hydroWeight) },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Skirt depth',
    params: '1.5 – 4.0 m (scaled)',
    measures: 'Interception vs depth, skirt blow-back',
    calibrates: [
      { key: 'curtain.liftCoefficient', value: String(A.curtain.liftCoefficient) },
      { key: 'curtain.relativeHeave', value: String(A.curtain.relativeHeave) },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Current speed',
    params: '0.1 – 0.7 m/s',
    measures: 'Entrainment under the skirt, failure onset',
    calibrates: [
      { key: 'curtain.entrainmentGain', value: String(A.curtain.entrainmentGain) },
      { key: 'envelope.currentSpeed.max', value: `${OPERATING_ENVELOPE.currentSpeed.max} m/s` },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Bloom density',
    params: 'Low → extreme',
    measures: 'Throat congestion, transfer throughput',
    calibrates: [
      { key: 'throat.holdCapacityPerThousand', value: String(A.throat.holdCapacityPerThousand) },
      { key: 'transfer.designRatePerThousand', value: `${A.transfer.designRatePerThousand} /s` },
    ],
    facility: 'Flume + tank',
    status: 'PENDING',
  },
  {
    name: 'Under-skirt rate',
    params: 'Depth distributions',
    measures: 'Escape probability by depth',
    calibrates: [
      { key: 'agent.verticalNoise', value: `${A.agent.verticalNoise} m/s` },
      { key: 'agent.verticalGain', value: `${A.agent.verticalGain} /s` },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Conveyor jets',
    params: '0 – 100 % jet output',
    measures: 'Along-face speed, guidance at slack water',
    calibrates: [
      { key: 'jets.conveyorSpeed', value: `${A.jets.conveyorSpeed} m/s` },
      { key: 'jets.conveyorBand', value: `${A.jets.conveyorBand} m` },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Foot jets',
    params: 'Uplift × skirt depth',
    measures: 'Under-skirt escape with jets on and off',
    calibrates: [
      { key: 'jets.footUplift', value: `${A.jets.footUplift} m/s` },
      { key: 'jets.footReach', value: `${A.jets.footReach} m` },
    ],
    facility: 'Flume',
    status: 'PENDING',
  },
  {
    name: 'Jet shear on bells',
    params: 'Nozzle exit 0.5 – 2 m/s',
    measures: 'Bell damage threshold for live Catostylus',
    calibrates: [],
    note: 'Sets the maximum nozzle exit velocity — a hard design limit, not a model parameter.',
    facility: 'Live tests',
    status: 'PENDING',
  },
  {
    name: 'Curtain contact time',
    params: 'Angle × speed',
    measures: 'Contact duration, behaviour at the curtain face',
    calibrates: [
      { key: 'curtain.interactionRange', value: `${A.curtain.interactionRange} m` },
      { key: 'curtain.minStandoff', value: `${A.curtain.minStandoff} m` },
    ],
    facility: 'Flume + live',
    status: 'PENDING',
  },
  {
    name: 'Transfer damage',
    params: 'Ejector · screw · passive',
    measures: 'Bell damage, oral-arm loss',
    calibrates: [],
    note: 'Informs transfer technology selection — not a model parameter.',
    facility: 'Live tests',
    status: 'PENDING',
  },
  {
    name: 'Post-transfer condition',
    params: '24 – 72 h holding',
    measures: 'Pulsation, recovery, survival',
    calibrates: [],
    note: 'Release viability — survival is not modelled by the simulation.',
    facility: 'Live tests',
    status: 'PENDING',
  },
  {
    name: 'Pop-up rise',
    params: 'Inflation from the seabed',
    measures: 'Time to full height, fouling after storage',
    calibrates: [
      { key: 'deploy.popUpDelay', value: `${A.deploy.popUpDelay} s` },
      { key: 'deploy.popUpSpeed', value: `${A.deploy.popUpSpeed} m/s` },
    ],
    facility: 'Pilot',
    status: 'FUTURE',
  },
  {
    name: 'SafeOpen reefing',
    params: 'Upstream-first sequence',
    measures: 'Reef timing, released traffic',
    calibrates: [
      { key: 'safeOpen.upstreamReefSpeed', value: `${A.safeOpen.upstreamReefSpeed} m/s` },
      { key: 'safeOpen.clearingReefSpeed', value: `${A.safeOpen.clearingReefSpeed} m/s` },
      { key: 'safeOpen.finalReefSpeed', value: `${A.safeOpen.finalReefSpeed} m/s` },
    ],
    facility: 'Pilot',
    status: 'FUTURE',
  },
];

function StatusPill({ s }: { s: Status }) {
  const t = STATUS_TONE[s];
  return (
    <Pill tone={t.pill} dot={false} className="!h-[24px] !gap-1 !px-2 !text-[10.5px]">
      {t.icon}
      {s}
    </Pill>
  );
}

function CurrentStatus() {
  const counts = { BUILT: 0, PENDING: 0, FUTURE: 0 } as Record<Status, number>;
  for (const r of STATUS) counts[r.status]++;
  return (
    <Panel title="Current Status" subtitle="Programme stages" icon={<ListChecks size={18} />} bodyClassName="flex flex-col gap-3">
      <div>
        <div className="flex h-[7px] overflow-hidden rounded-full bg-white/[0.06]">
          <div className="bg-teal" style={{ width: `${(counts.BUILT / STATUS.length) * 100}%` }} />
          <div className="bg-amber/80" style={{ width: `${(counts.PENDING / STATUS.length) * 100}%` }} />
        </div>
        <div className="mt-2 flex gap-4 text-[12.5px] text-muted">
          <span>
            <span className="text-teal">{counts.BUILT}</span> built
          </span>
          <span>
            <span className="text-amber">{counts.PENDING}</span> pending
          </span>
          <span>
            <span className="text-ink-2">{counts.FUTURE}</span> future
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {STATUS.map((r) => (
          <div key={r.item} className="card-inner flex items-center gap-3.5 px-3.5 py-3">
            <IconTile size={40} tone={STATUS_TONE[r.status].tile}>
              {r.icon}
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-medium text-ink">{r.item}</div>
              <div className="text-[12.5px] leading-snug text-muted">{r.detail}</div>
            </div>
            <StatusPill s={r.status} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Targets() {
  const snap = useSnap();
  const s = snap?.sweepline;
  const b = snap?.baseline;
  const reduction = b && s && b.intakeContactPct && s.intakeContactPct !== null ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const rows: Array<{ metric: string; target: string; sim: string }> = [
    { metric: 'Diversion efficiency', target: '≥ 80%', sim: pct(s?.diversionEfficiency ?? null) },
    { metric: 'Under-skirt escape', target: '≤ 10%', sim: pct(s?.underSkirtPct ?? null) },
    { metric: 'Intake contact reduction vs baseline', target: '≥ 70%', sim: reduction === null ? '—' : pct(reduction) },
    { metric: 'Average curtain contact time', target: '≤ 5 min', sim: s?.avgContactTime ? mmss(s.avgContactTime) : '—' },
    { metric: 'Bell damage after transfer', target: 'TBD with biologists', sim: 'Not modelled' },
    { metric: 'Post-transfer survival (72 h)', target: 'TBD with biologists', sim: 'Not modelled' },
    { metric: 'SafeOpen completion (fully reefed)', target: '≤ 10 min', sim: 'See SafeOpen scenario' },
    {
      metric: 'Warning to fully deployed (pop-up)',
      target: '≤ 5 min',
      sim: `${((A.deploy.popUpDelay + ((snap?.curtain.length ?? 120) + A.curtain.skirtDropLag + 3) / A.deploy.popUpSpeed) / 60).toFixed(1)} min`,
    },
  ];
  const th = 'pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase';
  return (
    <Panel
      title="Development Targets"
      subtitle="What the programme aims to demonstrate"
      icon={<Target size={18} />}
      iconTone="amber"
      actions={
        <Pill tone="amber" dot={false}>
          TARGETS — NOT ACHIEVED
        </Pill>
      }
    >
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className={th}>Metric</th>
            <th className={th}>Target</th>
            <th className={th}>Simulation estimate</th>
            <th className={cn(th, 'text-right')}>Validated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.metric} className="border-b border-line/60 last:border-0">
              <td className="py-2.5 pr-3 text-ink-2">{t.metric}</td>
              <td className="num py-2.5 pr-3 text-ink">{t.target}</td>
              <td className="num py-2.5 pr-3 text-ink-2">{t.sim}</td>
              <td className="py-2.5 text-right">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                  <XCircle size={14} /> Not yet
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-dim">Simulation estimates come from the live run (same seed as the baseline) and are not evidence of field performance.</p>
    </Panel>
  );
}

function TestProgramme() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TESTS.filter((t) => {
      if (filter !== 'ALL' && t.status !== filter) return false;
      if (!q) return true;
      return [t.name, t.params, t.measures, t.facility, t.note ?? '', ...t.calibrates.map((c) => c.key)].some((f) => f.toLowerCase().includes(q));
    });
  }, [query, filter]);
  return (
    <Panel
      title="Proposed Test Programme"
      subtitle="Each test calibrates named model assumptions"
      icon={<FlaskRound size={18} />}
      actions={
        <div className="flex items-center gap-2">
          <label className="relative flex items-center">
            <Search size={15} className="pointer-events-none absolute left-3 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tests or parameters"
              className="input !h-[36px] w-[250px] !pr-8 !pl-9 !font-sans !text-[13.5px]"
              aria-label="Search tests"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 rounded p-0.5 text-muted hover:text-white" title="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'FUTURE', label: 'Future' },
            ]}
          />
        </div>
      }
      bodyClassName="flex flex-col gap-2"
    >
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_110px_28px] gap-4 px-4 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        <span>Test</span>
        <span>Parameters</span>
        <span>Measures</span>
        <span>Facility</span>
        <span className="text-right">Status</span>
        <span />
      </div>
      {rows.length === 0 && <div className="card-inner px-4 py-6 text-center text-[13px] text-muted">No tests match “{query}”.</div>}
      {rows.map((t) => {
        const isOpen = open === t.name;
        return (
          <div key={t.name} className={cn('card-inner overflow-hidden transition-colors', isOpen && '!border-cyan/35')}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : t.name)}
              aria-expanded={isOpen}
              className="grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_110px_28px] items-center gap-4 px-4 py-3 text-left hover:bg-white/[0.02]"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-[14px] font-medium text-ink">
                <FlaskRound size={15} className="shrink-0 text-cyan" />
                <span className="truncate">{t.name}</span>
              </span>
              <span className="num truncate text-[13px] text-ink-2">{t.params}</span>
              <span className="truncate text-[13px] text-ink-2">{t.measures}</span>
              <span className="truncate text-[13px] text-ink-2">{t.facility}</span>
              <span className="text-right">
                <StatusPill s={t.status} />
              </span>
              <ChevronDown size={16} className={cn('justify-self-end text-muted transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="grid animate-fade-in grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 border-t border-line px-4 py-3.5">
                <div>
                  <div className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">Test parameters</div>
                  <div className="text-[13.5px] text-ink">{t.params}</div>
                  <div className="mt-1 text-[13px] text-ink-2">{t.measures}</div>
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">Calibrates (current assumed values)</div>
                  {t.calibrates.length === 0 ? (
                    <div className="text-[13px] text-ink-2">{t.note}</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {t.calibrates.map((c) => (
                        <span key={c.key} className="num inline-flex items-center gap-2 rounded-lg border border-line-strong bg-white/[0.03] px-2.5 py-1 text-[12px]">
                          <span className="text-muted">{c.key}</span>
                          <span className="text-cyan">{c.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function UseCard({ title, subtitle, items, good }: { title: string; subtitle: string; items: string[]; good: boolean }) {
  return (
    <Panel title={title} subtitle={subtitle} icon={good ? <CheckCircle2 size={18} /> : <XCircle size={18} />} iconTone={good ? 'teal' : 'amber'}>
      <ul className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
            {good ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-amber" />}
            {it}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Validation() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Validation"
        title="What Is Validated — and What Is Not"
        subtitle="Nothing here has been field-validated. The visualiser and agent model are built; calibration and live testing are pending."
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-start gap-5">
        <CurrentStatus />
        <Targets />
      </div>
      <TestProgramme />
      <div className="grid grid-cols-2 items-start gap-5">
        <UseCard
          good
          title="What This Visualiser Can Tell You"
          subtitle="Appropriate use"
          items={[
            'How an angled guide curtain converts incoming flow into lateral sweeping flow.',
            'Which design levers matter (angle, skirt depth, transfer capacity) and their trade-offs.',
            'How the fail-safe sequence behaves, and that existing protection is restored.',
            'Where the assumed operating envelope ends — and that SweepLine says so.',
          ]}
        />
        <UseCard
          good={false}
          title="What It Cannot Tell You"
          subtitle="Limits"
          items={[
            'Validated field performance — the agent model is not CFD and is uncalibrated.',
            'Exact plant geometry — the reference coastal intake is schematic, not ENEC facility data.',
            'Jellyfish injury or survival — transfer damage is untested.',
            'Costs — the cost model requires UAE supplier quotations.',
          ]}
        />
      </div>
    </div>
  );
}
