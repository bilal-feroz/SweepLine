import { ArrowDownRight, Clock3, Download, FileSpreadsheet, Gauge, Info, LineChart, Table2, Waves } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useHistory, useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { downsample, Legend, SERIES, TimeChart, type SeriesDef } from '../components/charts/TimeChart';
import { PageHeader } from '../components/layout/PageHeader';
import { Icon } from '../components/ui/icons';
import { IconTile, Panel, Pill, type TileTone } from '../components/ui/Panel';
import { controller } from '../simulation/SimController';
import type { ScreenLoad } from '../simulation/metrics';
import { cn, downloadText, mmss, pct } from '../utils/format';

const BOTH: SeriesDef[] = [
  { key: 'b', name: 'Baseline', color: SERIES.baseline },
  { key: 's', name: 'SweepLine', color: SERIES.sweepline },
];
const ONE: SeriesDef[] = [{ key: 'v', name: 'SweepLine', color: SERIES.sweepline }];

const LOAD_TEXT: Record<ScreenLoad, string> = { HIGH: 'text-red', MEDIUM: 'text-amber', LOW: 'text-teal' };

function KpiCard({ icon, tone, label, value, sub }: { icon: ReactNode; tone?: TileTone; label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <IconTile size={44} tone={tone}>
          {icon}
        </IconTile>
        <span className="text-[14.5px] leading-snug text-ink">{label}</span>
      </div>
      <div className="text-[30px] leading-none font-semibold tracking-tight">{value}</div>
      <div className="truncate text-[13px] text-muted">{sub}</div>
    </section>
  );
}

function ChartCard({ title, sub, icon, series, children }: { title: string; sub: string; icon: ReactNode; series: SeriesDef[]; children: ReactNode }) {
  return (
    <Panel title={title} subtitle={sub} icon={icon} actions={<Legend series={series} />}>
      {children}
    </Panel>
  );
}

export function Performance() {
  const snap = useSnap();
  const hist = useHistory(undefined, 1000);
  const showToast = useApp((s) => s.showToast);
  const [table, setTable] = useState(false);
  const rows = useMemo(() => downsample(hist, 240), [hist]);

  const contacts = useMemo(() => rows.map((h) => ({ t: h.t, b: h.bContacts, s: h.sContacts })), [rows]);
  const rate = useMemo(() => rows.map((h) => ({ t: h.t, b: h.bRate, s: h.sRate })), [rows]);
  const diverted = useMemo(() => rows.map((h) => ({ t: h.t, v: h.diverted })), [rows]);
  const under = useMemo(() => rows.map((h) => ({ t: h.t, v: h.underPct === null ? null : h.underPct * 100 })), [rows]);
  const util = useMemo(() => rows.map((h) => ({ t: h.t, v: h.utilisation === null ? null : Math.min(150, h.utilisation * 100) })), [rows]);
  const load = useMemo(() => rows.map((h) => ({ t: h.t, v: h.load * 100 })), [rows]);
  const contact = useMemo(() => rows.map((h) => ({ t: h.t, v: h.contactTime })), [rows]);

  if (!snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  const reduction = b.intakeContactPct !== null && s.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const under10 = s.underSkirtPct;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Performance"
        title="Baseline vs SweepLine"
        subtitle={`Same seed (${snap.params.seed}), same bloom, same conditions · ${mmss(snap.simTime)} simulated · ${snap.scenarioName}`}
        right={
          <div className="flex items-center gap-2">
            <Pill tone="amber" dot={false}>
              SIMULATION ESTIMATE
            </Pill>
            <button type="button" className="btn !h-[40px] !px-3.5" onClick={() => setTable((t) => !t)}>
              {table ? <LineChart size={15} /> : <Table2 size={15} />} {table ? 'Chart view' : 'Table view'}
            </button>
            <button
              type="button"
              className="btn !h-[40px] !px-3.5"
              onClick={() => {
                downloadText(`sweepline-metrics-${snap.params.seed}.csv`, controller.exportCsv(), 'text/csv');
                showToast('Metric history exported (CSV)', 'ok');
              }}
            >
              <FileSpreadsheet size={15} /> CSV
            </button>
            <button
              type="button"
              className="btn btn-solid !h-[40px] !px-3.5"
              onClick={() => {
                downloadText(`sweepline-run-${snap.params.seed}.json`, JSON.stringify(controller.exportRun(), null, 2));
                showToast('Simulation run exported (JSON)', 'ok');
              }}
            >
              <Download size={15} /> Export run
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={<ArrowDownRight size={22} />}
          tone={reduction !== null && reduction < 0 ? 'amber' : 'teal'}
          label="Intake Contact Reduction"
          value={<span className={reduction === null ? 'text-muted' : reduction > 0 ? 'text-teal' : 'text-amber'}>{reduction === null ? '—' : pct(reduction)}</span>}
          sub={reduction === null ? 'Awaiting enough resolved outcomes' : `${pct(b.intakeContactPct, 1)} → ${pct(s.intakeContactPct, 1)} with SweepLine`}
        />
        <KpiCard
          icon={<Icon name="intake" size={22} />}
          tone={s.screenLoad === 'HIGH' ? 'red' : s.screenLoad === 'MEDIUM' ? 'amber' : 'cyan'}
          label="Screen Loading"
          value={
            <span className="flex items-baseline gap-2">
              <span className={LOAD_TEXT[b.screenLoad]}>{b.screenLoad}</span>
              <span className="text-[20px] text-muted">→</span>
              <span className={LOAD_TEXT[s.screenLoad]}>{s.screenLoad}</span>
            </span>
          }
          sub={`${b.intakeRatePerMin.toFixed(1)} → ${s.intakeRatePerMin.toFixed(1)} contacts per min`}
        />
        <KpiCard
          icon={<Icon name="throat" size={22} />}
          label="Diverted to Recovery"
          value={<span className="text-cyan">{s.diverted.toLocaleString()}</span>}
          sub={`Diversion efficiency ${pct(s.diversionEfficiency, 1)}`}
        />
        <KpiCard
          icon={<Waves size={22} />}
          tone={under10 !== null && under10 > 0.2 ? 'red' : under10 !== null && under10 > 0.1 ? 'amber' : 'cyan'}
          label="Under-skirt Escape"
          value={
            <span className={under10 === null ? 'text-muted' : under10 <= 0.1 ? 'text-ink' : under10 <= 0.2 ? 'text-amber' : 'text-red'}>{pct(under10, 1)}</span>
          }
          sub={`${s.underSkirt} escapes · ${s.overtopped} overtopped`}
        />
      </div>

      {table ? (
        <Panel title="Results Table" subtitle="Table view of the charted metrics" icon={<Table2 size={18} />}>
          <ResultsTable />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ChartCard title="Intake Contacts" sub="Cumulative jellyfish reaching the intake screens" icon={<Icon name="intake" size={18} />} series={BOTH}>
              <TimeChart data={contacts} series={BOTH} digits={0} yLabel="Contacts (cumulative)" />
            </ChartCard>
            <ChartCard title="Intake Contact Rate" sub="Per minute, rolling 5-minute window" icon={<Gauge size={18} />} series={BOTH}>
              <TimeChart data={rate} series={BOTH} digits={2} unit=" /min" yLabel="Contacts per minute" />
            </ChartCard>
            <ChartCard title="Diverted Jellyfish" sub="Cumulative arrivals at the recovery throat" icon={<Icon name="throat" size={18} />} series={ONE}>
              <TimeChart data={diverted} series={ONE} digits={0} yLabel="Diverted (cumulative)" />
            </ChartCard>
            <ChartCard title="Under-skirt Escape" sub="Share of resolved curtain encounters" icon={<Waves size={18} />} series={ONE}>
              <TimeChart data={under} series={ONE} unit="%" digits={1} yLabel="% of encounters" />
            </ChartCard>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <ChartCard title="Transfer Utilisation" sub="Throughput / available capacity" icon={<Icon name="transfer" size={18} />} series={ONE}>
              <TimeChart data={util} series={ONE} unit="%" digits={0} height={170} reference={{ y: 100, label: 'Capacity' }} />
            </ChartCard>
            <ChartCard title="Curtain Load" sub="Share of assumed design load" icon={<Icon name="curtain" size={18} />} series={ONE}>
              <TimeChart data={load} series={ONE} unit="%" digits={0} height={170} reference={{ y: 100, label: 'Envelope limit' }} />
            </ChartCard>
            <ChartCard title="Curtain Contact Time" sub="Mean seconds from first contact to throat" icon={<Clock3 size={18} />} series={ONE}>
              <TimeChart data={contact} series={ONE} unit=" s" digits={0} height={170} />
            </ChartCard>
          </div>
          <div className="card flex items-start gap-3 px-5 py-4 text-[13px] leading-relaxed text-ink-2">
            <Info size={17} className="mt-0.5 shrink-0 text-cyan" />
            <p>
              Both worlds receive the identical bloom (same seed, spawn times, positions, depths and individual noise). Percentages use resolved outcomes
              only — agents still in transit are excluded. Values are an agent-based engineering simulation, not CFD and not validated field performance;
              every assumption in <span className="num text-[12px] text-ink">src/config/assumptions.ts</span> is exported with each run.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ResultsTable() {
  const snap = useSnap();
  const hist = useHistory(undefined, 2000);
  if (!snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  const rows: Array<[string, string, string]> = [
    ['Intake contact (% of resolved)', pct(b.intakeContactPct, 1), pct(s.intakeContactPct, 1)],
    ['Intake contacts (count)', String(b.intakeContacts), String(s.intakeContacts)],
    ['Contact rate (/min, 5-min window)', b.intakeRatePerMin.toFixed(2), s.intakeRatePerMin.toFixed(2)],
    ['Screen loading', b.screenLoad, s.screenLoad],
    ['Resolved outcomes', String(b.resolved), String(s.resolved)],
    ['Encountered SweepLine', '—', String(s.encountered)],
    ['Diverted to recovery throat', '—', String(s.diverted)],
    ['Diversion efficiency', '—', pct(s.diversionEfficiency, 1)],
    ['Under-skirt escape', '—', `${s.underSkirt} (${pct(s.underSkirtPct, 1)})`],
    ['Wave overtopping', '—', String(s.overtopped)],
    ['Released by reefing (dispersed)', '—', String(s.reefReleased)],
    ['Transferred / released', '—', `${s.transferred} / ${s.released}`],
    ['Average curtain contact time', '—', s.avgContactTime === null ? '—' : mmss(s.avgContactTime)],
  ];
  const recent = hist.slice(-14);
  const th = 'py-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase';
  return (
    <div className="grid grid-cols-[1.1fr_1.4fr] gap-6">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className={th}>Metric</th>
            <th className={cn(th, 'text-right')}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES.baseline }} />
                Baseline
              </span>
            </th>
            <th className={cn(th, 'text-right')}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES.sweepline }} />
                SweepLine
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, bv, sv]) => (
            <tr key={k} className="border-b border-line/60">
              <td className="py-2 text-ink-2">{k}</td>
              <td className="num py-2 text-right text-ink">{bv}</td>
              <td className="num py-2 text-right text-ink">{sv}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className={th}>t</th>
              <th className={cn(th, 'text-right')}>Base contacts</th>
              <th className={cn(th, 'text-right')}>Sweep contacts</th>
              <th className={cn(th, 'text-right')}>Diverted</th>
              <th className={cn(th, 'text-right')}>Under %</th>
              <th className={cn(th, 'text-right')}>Util %</th>
              <th className={cn(th, 'text-right')}>Load %</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((h) => (
              <tr key={h.t} className="border-b border-line/50">
                <td className="num py-1.5 text-muted">{mmss(h.t)}</td>
                <td className="num py-1.5 text-right">{h.bContacts}</td>
                <td className="num py-1.5 text-right">{h.sContacts}</td>
                <td className="num py-1.5 text-right">{h.diverted}</td>
                <td className="num py-1.5 text-right">{h.underPct === null ? '—' : (h.underPct * 100).toFixed(1)}</td>
                <td className="num py-1.5 text-right">{h.utilisation === null ? '—' : (Math.min(1.5, h.utilisation) * 100).toFixed(0)}</td>
                <td className="num py-1.5 text-right">{(h.load * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[12px] text-dim">Latest samples (every 2 s simulated). Full history in the CSV export.</div>
      </div>
    </div>
  );
}
