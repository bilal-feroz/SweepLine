import { Download, FileSpreadsheet, Table2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useHistory, useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { downsample, Legend, SERIES, TimeChart } from '../components/charts/TimeChart';
import { PageHeader } from '../components/layout/PageHeader';
import { EstimateTag, Panel } from '../components/ui/Panel';
import { controller } from '../simulation/SimController';
import { cn, downloadText, mmss, pct } from '../utils/format';

const BOTH = [
  { key: 'b', name: 'Baseline', color: SERIES.baseline },
  { key: 's', name: 'SweepLine', color: SERIES.sweepline },
];

function ChartCard({ title, sub, children, legend }: { title: string; sub?: string; children: ReactNode; legend?: boolean }) {
  return (
    <Panel
      title={title}
      eyebrow={sub}
      actions={legend ? <Legend series={BOTH} /> : <span className="flex items-center gap-1.5 text-[11px] text-ink-2"><span className="h-[2px] w-3.5 rounded" style={{ background: SERIES.sweepline }} />SweepLine</span>}
    >
      {children}
    </Panel>
  );
}

function Kpi({ label, base, sweep, better, fmt }: { label: string; base: string; sweep: string; better: boolean | null; fmt?: string }) {
  return (
    <div className="panel-flat px-3.5 py-3">
      <div className="text-[11.5px] text-ink-2">{label}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1 text-[10px] text-muted">
            <span className="h-[2px] w-2.5 rounded" style={{ background: SERIES.baseline }} />
            Baseline
          </div>
          <div className="num text-[18px] text-ink">{base}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[10px] text-muted">
            <span className="h-[2px] w-2.5 rounded" style={{ background: SERIES.sweepline }} />
            SweepLine
          </div>
          <div className={cn('num text-[18px]', better === null ? 'text-ink' : better ? 'text-teal' : 'text-amber')}>{sweep}</div>
        </div>
      </div>
      {fmt && <div className="mt-1 text-[10.5px] text-dim">{fmt}</div>}
    </div>
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
  const reduction = b.intakeContactPct && s.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const one = [{ key: 'v', name: 'SweepLine', color: SERIES.sweepline }];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Performance"
        title="Baseline vs SweepLine"
        subtitle={`Same seed (${snap.params.seed}), same bloom, same conditions · ${mmss(snap.simTime)} simulated · ${snap.scenarioName}`}
        right={
          <div className="flex items-center gap-2">
            <EstimateTag className="!text-[10.5px] !text-amber" />
            <button type="button" className="btn" onClick={() => setTable((t) => !t)}>
              <Table2 size={13} /> {table ? 'Chart view' : 'Table view'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                downloadText(`sweepline-metrics-${snap.params.seed}.csv`, controller.exportCsv(), 'text/csv');
                showToast('Metric history exported (CSV)', 'ok');
              }}
            >
              <FileSpreadsheet size={13} /> CSV
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                downloadText(`sweepline-run-${snap.params.seed}.json`, JSON.stringify(controller.exportRun(), null, 2));
                showToast('Simulation run exported (JSON)', 'ok');
              }}
            >
              <Download size={13} /> Export run
            </button>
          </div>
        }
      />

      <div className="grid shrink-0 grid-cols-6 gap-3">
        <Kpi label="Intake contact" base={pct(b.intakeContactPct, 1)} sweep={pct(s.intakeContactPct, 1)} better={s.intakeContactPct !== null && b.intakeContactPct !== null ? s.intakeContactPct < b.intakeContactPct : null} fmt={reduction !== null ? `${pct(-reduction)} relative change` : 'awaiting sample'} />
        <Kpi label="Screen loading" base={b.screenLoad} sweep={s.screenLoad} better={s.screenLoad !== 'HIGH'} fmt={`${b.intakeRatePerMin.toFixed(1)} → ${s.intakeRatePerMin.toFixed(1)} per min`} />
        <Kpi label="Diverted to recovery" base="—" sweep={String(s.diverted)} better={null} fmt={`Diversion efficiency ${pct(s.diversionEfficiency, 1)}`} />
        <Kpi label="Under-skirt escape" base="—" sweep={pct(s.underSkirtPct, 1)} better={s.underSkirtPct !== null ? s.underSkirtPct <= 0.1 : null} fmt={`${s.underSkirt} escapes · ${s.overtopped} overtopped`} />
        <Kpi label="Transfer utilisation" base="—" sweep={s.transferUtilisation === null ? 'Idle' : pct(Math.min(1, s.transferUtilisation))} better={null} fmt={`${s.transferred} transferred · ${s.released} released`} />
        <Kpi label="Avg curtain contact" base="—" sweep={s.avgContactTime === null ? '—' : mmss(s.avgContactTime)} better={null} fmt={`Curtain load ${(s.curtainLoad * 100).toFixed(0)}% · ${s.curtainLoadLabel.toLowerCase()}`} />
      </div>

      {table ? (
        <Panel title="Results table" eyebrow="Table view of the charted metrics">
          <ResultsTable />
        </Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <ChartCard title="Intake contacts over time" sub="Cumulative jellyfish reaching the intake screens" legend>
            <TimeChart data={contacts} series={BOTH} digits={0} />
          </ChartCard>
          <ChartCard title="Intake contact rate" sub="Per minute, rolling 5-minute window" legend>
            <TimeChart data={rate} series={BOTH} digits={2} unit=" /min" />
          </ChartCard>
          <ChartCard title="Diverted jellyfish" sub="Cumulative arrivals at the recovery throat">
            <TimeChart data={diverted} series={one} digits={0} />
          </ChartCard>
          <ChartCard title="Under-skirt escape" sub="% of resolved curtain encounters">
            <TimeChart data={under} series={one} unit="%" digits={1} />
          </ChartCard>
          <ChartCard title="Transfer utilisation" sub="Throughput / available capacity">
            <TimeChart data={util} series={one} unit="%" digits={0} reference={{ y: 100, label: 'Capacity' }} />
          </ChartCard>
          <ChartCard title="Curtain load" sub="% of assumed design load">
            <TimeChart data={load} series={one} unit="%" digits={0} reference={{ y: 100, label: 'Envelope limit' }} />
          </ChartCard>
          <ChartCard title="Average curtain contact time" sub="Seconds from first contact to throat">
            <TimeChart data={contact} series={one} unit=" s" digits={0} />
          </ChartCard>
          <Panel title="Reading these results" eyebrow="Method">
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-ink-2">
              <li>Both worlds receive the identical bloom: same seed, spawn times, positions, depths and individual noise.</li>
              <li>Percentages use resolved outcomes only (contact, diversion or passing the intake line); agents in progress are excluded.</li>
              <li>Values are an agent-based engineering simulation — not CFD and not validated field performance.</li>
              <li>Assumptions live in src/config/assumptions.ts and are exported with every run.</li>
            </ul>
          </Panel>
        </div>
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
  const recent = hist.slice(-12);
  return (
    <div className="grid grid-cols-[1.1fr_1.4fr] gap-4">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] tracking-[0.08em] text-muted uppercase">
            <th className="py-1.5 font-semibold">Metric</th>
            <th className="py-1.5 text-right font-semibold">Baseline</th>
            <th className="py-1.5 text-right font-semibold">SweepLine</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, bv, sv]) => (
            <tr key={k} className="border-b border-line/50">
              <td className="py-1.5 text-ink-2">{k}</td>
              <td className="num py-1.5 text-right text-ink">{bv}</td>
              <td className="num py-1.5 text-right text-ink">{sv}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] tracking-[0.06em] text-muted uppercase">
              <th className="py-1.5">t</th>
              <th className="py-1.5 text-right">Base contacts</th>
              <th className="py-1.5 text-right">Sweep contacts</th>
              <th className="py-1.5 text-right">Diverted</th>
              <th className="py-1.5 text-right">Under %</th>
              <th className="py-1.5 text-right">Util %</th>
              <th className="py-1.5 text-right">Load %</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((h) => (
              <tr key={h.t} className="border-b border-line/40">
                <td className="num py-1 text-muted">{mmss(h.t)}</td>
                <td className="num py-1 text-right">{h.bContacts}</td>
                <td className="num py-1 text-right">{h.sContacts}</td>
                <td className="num py-1 text-right">{h.diverted}</td>
                <td className="num py-1 text-right">{h.underPct === null ? '—' : (h.underPct * 100).toFixed(1)}</td>
                <td className="num py-1 text-right">{h.utilisation === null ? '—' : (Math.min(1.5, h.utilisation) * 100).toFixed(0)}</td>
                <td className="num py-1 text-right">{(h.load * 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1.5 text-[10.5px] text-dim">Latest 12 samples (every 2 s simulated). Full history in the CSV export.</div>
      </div>
    </div>
  );
}
