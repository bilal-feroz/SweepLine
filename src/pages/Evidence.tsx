import { CheckCircle2, CircleDashed, Download, FlaskRound, Info, Waves } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useHistory, useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { downsample, Legend, SERIES, TimeChart, type SeriesDef } from '../components/charts/TimeChart';
import { Icon } from '../components/ui/icons';
import { IconTile, Panel, type TileTone } from '../components/ui/Panel';
import { controller } from '../simulation/SimController';
import { cn, downloadText, mmss, pct } from '../utils/format';

const BOTH: SeriesDef[] = [
  { key: 'b', name: 'Without SweepLine', color: SERIES.baseline },
  { key: 's', name: 'With SweepLine', color: SERIES.sweepline },
];

function Metric({ icon, tone, value, label, detail, valueTone }: { icon: ReactNode; tone?: TileTone; value: string; label: string; detail: string; valueTone: string }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <IconTile size={40} tone={tone}>
          {icon}
        </IconTile>
        <span className="text-[14.5px] text-ink">{label}</span>
      </div>
      <div className={cn('num text-[40px] leading-none font-semibold tracking-tight', valueTone)}>{value}</div>
      <p className="text-[13px] leading-snug text-muted">{detail}</p>
    </section>
  );
}

const BUILT = [
  { title: 'Simulation visualiser', detail: '3D digital twin of a reference coastal intake' },
  { title: 'Agent model', detail: 'Seeded agent-based model with a same-seed baseline' },
];
const NEXT = [
  { title: 'Flume calibration', detail: 'Scaled curtain and jets: guidance, skirt depth, under-skirt rate' },
  { title: 'Biological testing', detail: 'Live Blue Blubber: transfer handling and bell condition' },
  { title: 'Coastal pilot', detail: 'One curtain arm: pop-up timing and SafeOpen in real conditions' },
];

/** 03 — Evidence: does SweepLine appear to work, and how much should we trust the result? */
export function Evidence() {
  const snap = useSnap();
  const hist = useHistory(undefined, 1000);
  const showToast = useApp((s) => s.showToast);
  const rows = useMemo(() => downsample(hist, 240).map((h) => ({ t: h.t, b: h.bContacts, s: h.sContacts })), [hist]);
  if (!snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  const reduction = b.intakeContactPct !== null && s.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const under = s.underSkirtPct;
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="flex items-end justify-between gap-6">
          <div className="max-w-[880px]">
            <div className="page-eyebrow">Evidence</div>
            <h1 className="mt-1.5 text-[clamp(30px,2.6vw,42px)] leading-[1.08] font-bold tracking-tight text-white">
              <span className="text-teal">{reduction === null ? '—' : pct(reduction)}</span> fewer intake contacts
              <span className="text-ink-2"> in the same-seed simulation</span>
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
              The same bloom — identical seed, timing, positions and depths — runs with and without SweepLine. {mmss(snap.simTime)} simulated ·{' '}
              {snap.scenarioName}.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="btn !h-[38px] !px-3.5"
              onClick={() => {
                downloadText(`sweepline-run-${snap.params.seed}.json`, JSON.stringify(controller.exportRun(), null, 2));
                showToast('Simulation run exported (JSON)', 'ok');
              }}
              title="Scenario, seed, parameters, assumptions, metrics and events"
            >
              <Download size={15} /> Run data
            </button>
            <button
              type="button"
              className="btn !h-[38px] !px-3.5"
              onClick={() => {
                downloadText(`sweepline-metrics-${snap.params.seed}.csv`, controller.exportCsv(), 'text/csv');
                showToast('Metric history exported (CSV)', 'ok');
              }}
            >
              <Download size={15} /> CSV
            </button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-4">
          <Metric
            icon={<Icon name="intake" size={20} />}
            tone="teal"
            label="Intake reduction"
            value={reduction === null ? '—' : pct(reduction)}
            valueTone={reduction === null ? 'text-muted' : reduction > 0.5 ? 'text-teal' : 'text-amber'}
            detail={
              reduction === null
                ? 'Collecting enough resolved outcomes…'
                : `${pct(b.intakeContactPct, 1)} of the bloom reaches the screens without SweepLine, ${pct(s.intakeContactPct, 1)} with it.`
            }
          />
          <Metric
            icon={<Icon name="throat" size={20} />}
            label="Diversion efficiency"
            value={pct(s.diversionEfficiency)}
            valueTone="text-cyan"
            detail="Of the jellyfish that meet the curtain, the share delivered alive to the recovery throat."
          />
          <Metric
            icon={<Waves size={20} />}
            tone={under !== null && under > 0.1 ? 'amber' : 'cyan'}
            label="Under-skirt escape"
            value={pct(under)}
            valueTone={under !== null && under > 0.1 ? 'text-amber' : 'text-ink'}
            detail="Of the jellyfish that meet the curtain, the share that slip underneath it."
          />
        </div>

        <Panel title="Jellyfish reaching the intake" subtitle="Cumulative contacts with the intake screens — same bloom, with and without SweepLine" actions={<Legend series={BOTH} />}>
          <TimeChart data={rows} series={BOTH} digits={0} height={260} yLabel="Intake contacts (cumulative)" />
        </Panel>

        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-stretch gap-5">
          <Panel title="Validation status" subtitle="What exists today and what comes next" icon={<FlaskRound size={18} />}>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-teal uppercase">Built</div>
                <div className="flex flex-col gap-2">
                  {BUILT.map((x) => (
                    <div key={x.title} className="flex items-start gap-2.5">
                      <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-teal" />
                      <span>
                        <span className="block text-[14px] text-white">{x.title}</span>
                        <span className="block text-[12.5px] text-muted">{x.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-amber uppercase">Next</div>
                <div className="flex flex-col gap-2">
                  {NEXT.map((x) => (
                    <div key={x.title} className="flex items-start gap-2.5">
                      <CircleDashed size={17} className="mt-0.5 shrink-0 text-amber" />
                      <span>
                        <span className="block text-[14px] text-white">{x.title}</span>
                        <span className="block text-[12.5px] text-muted">{x.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
          <section className="card flex flex-col justify-center gap-3 border-amber/30 p-6">
            <div className="flex items-center gap-2.5 text-amber">
              <Info size={20} />
              <span className="text-[19px] font-semibold">Simulation estimates. Not field-validated.</span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              These numbers come from an uncalibrated agent-based model, not CFD or field trials. They show the mechanism and its trade-offs; flume and
              biological testing will set the real values. Every assumption is exported with the run data.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
