import { Download, Info, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/store';
import { PageHeader } from '../components/layout/PageHeader';
import { Toggle } from '../components/ui/Controls';
import { Panel } from '../components/ui/Panel';
import { cn, downloadText } from '../utils/format';

type Basis = 'deployment' | 'day' | 'season';

interface Line {
  id: string;
  label: string;
  note: string;
  value: string;
  basis?: Basis;
  optional?: boolean;
}

const CAPEX: Line[] = [
  { id: 'anchors', label: 'Permanent anchors', note: 'Pre-engineered seabed anchors for all three layouts', value: '' },
  { id: 'curtain', label: 'Curtain modules', note: 'Float line, smooth skirt and ballast — 10 m modules', value: '' },
  { id: 'reel', label: 'Deployment reel / handling', note: 'Throat-side reel, winches and handling gear', value: '' },
  { id: 'sensors', label: 'Sensors', note: 'Sonar / depth monitoring, load cells, flow and occupancy sensing', value: '' },
  { id: 'transferA', label: 'Transfer module A', note: 'Large-aperture low-shear module (technology TBD)', value: '' },
  { id: 'transferB', label: 'Optional standby transfer module', note: 'Redundant path — first fail-safe', value: '', optional: true },
  { id: 'piping', label: 'Piping', note: 'Floating transfer line, flotation collars, release diffuser', value: '' },
  { id: 'controls', label: 'Controls', note: 'SafeOpen logic, PLC, telemetry, operator HMI', value: '' },
  { id: 'install', label: 'Installation', note: 'Marine works, anchors, commissioning', value: '' },
];

const OPEX: Line[] = [
  { id: 'vessel', label: 'Deployment vessel', note: 'Workboat charter for deploy / stow', value: '', basis: 'deployment' },
  { id: 'crew', label: 'Crew', note: 'Marine crew and operator time', value: '', basis: 'day' },
  { id: 'power', label: 'Power', note: 'Transfer module and winch power', value: '', basis: 'day' },
  { id: 'cleaning', label: 'Cleaning', note: 'Curtain and throat cleaning / bio-fouling', value: '', basis: 'deployment' },
  { id: 'inspection', label: 'Inspection', note: 'Pre-season and post-deployment inspection', value: '', basis: 'season' },
  { id: 'storage', label: 'Storage', note: 'Off-season curtain storage', value: '', basis: 'season' },
  { id: 'monitoring', label: 'Environmental monitoring', note: 'Release-zone and animal-condition monitoring', value: '', basis: 'deployment' },
];

interface CostState {
  capex: Line[];
  opex: Line[];
  deployments: number;
  days: number;
  years: number;
  includeStandby: boolean;
}

const KEY = 'sweepline.costModel.v1';
const initial = (): CostState => ({ capex: CAPEX.map((l) => ({ ...l })), opex: OPEX.map((l) => ({ ...l })), deployments: 6, days: 5, years: 10, includeStandby: true });

function load(): CostState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const saved = JSON.parse(raw) as Partial<CostState>;
    const base = initial();
    const merge = (defs: Line[], s?: Line[]) => defs.map((d) => ({ ...d, ...(s?.find((x) => x.id === d.id) ?? {}), label: d.label, note: d.note }));
    return { ...base, ...saved, capex: merge(base.capex, saved.capex), opex: merge(base.opex, saved.opex) };
  } catch {
    return initial();
  }
}

const parse = (v: string): number | null => {
  const n = Number(v.replace(/[,\s]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

const aed = (n: number | null) => (n === null ? 'TBD' : `AED ${Math.round(n).toLocaleString('en-GB')}`);

function QuoteInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const bad = value.trim() !== '' && parse(value) === null;
  return (
    <div className="relative w-[150px]">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10.5px] text-dim">AED</span>
      <input
        className={cn('input !pl-9 text-right', bad && '!border-red/60')}
        value={value}
        placeholder="TBD"
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        aria-label="Supplier quote in AED"
      />
    </div>
  );
}

export function CostAnalysis() {
  const [st, setSt] = useState<CostState>(load);
  const showToast = useApp((s) => s.showToast);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* storage unavailable — model still works for this session */
    }
  }, [st]);

  const calc = useMemo(() => {
    const capexLines = st.capex.filter((l) => !(l.optional && !st.includeStandby));
    const capexVals = capexLines.map((l) => parse(l.value));
    const capexKnown = capexVals.filter((v): v is number => v !== null);
    const capex = capexKnown.reduce((a, b) => a + b, 0);
    const capexTbd = capexVals.length - capexKnown.length;
    let perDeployment = 0;
    let perSeasonFixed = 0;
    let opexTbd = 0;
    for (const l of st.opex) {
      const v = parse(l.value);
      if (v === null) {
        opexTbd++;
        continue;
      }
      if (l.basis === 'deployment') perDeployment += v;
      else if (l.basis === 'day') perDeployment += v * st.days;
      else perSeasonFixed += v;
    }
    const seasonOpex = perDeployment * st.deployments + perSeasonFixed;
    const annualised = st.years > 0 ? capex / st.years : 0;
    return { capex, capexTbd, perDeployment, seasonOpex, seasonal: seasonOpex + annualised, annualised, opexTbd, total: capexLines.length + st.opex.length };
  }, [st]);

  const setLine = (kind: 'capex' | 'opex', id: string, patch: Partial<Line>) =>
    setSt((s) => ({ ...s, [kind]: s[kind].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const complete = calc.capexTbd === 0 && calc.opexTbd === 0;
  const exportCsv = () => {
    const rows = [
      ['category', 'item', 'basis', 'supplier_quote_aed'],
      ...st.capex.filter((l) => !(l.optional && !st.includeStandby)).map((l) => ['CAPEX', l.label, 'one-off', parse(l.value)?.toString() ?? 'TBD']),
      ...st.opex.map((l) => ['OPEX', l.label, `per ${l.basis}`, parse(l.value)?.toString() ?? 'TBD']),
      [],
      ['deployments_per_season', String(st.deployments)],
      ['days_per_deployment', String(st.days)],
      ['amortisation_years', String(st.years)],
      ['capex_entered_aed', String(Math.round(calc.capex))],
      ['cost_per_deployment_aed', String(Math.round(calc.perDeployment))],
      ['seasonal_cost_aed', String(Math.round(calc.seasonal))],
      ['note', 'Cost model requires UAE supplier quotations; TBD lines are excluded from totals.'],
    ];
    downloadText('sweepline-cost-model.csv', rows.map((r) => r.join(',')).join('\n'), 'text/csv');
    showToast('Cost model exported (CSV)', 'ok');
  };

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
        <PageHeader
          eyebrow="Cost Analysis"
          title="Editable cost model"
          subtitle="No prices are assumed — enter supplier quotations (AED). Lines left as TBD are excluded from totals."
          right={
            <div className="flex gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSt(initial());
                  showToast('Cost model cleared', 'info');
                }}
              >
                <RotateCcw size={13} /> Clear
              </button>
              <button type="button" className="btn btn-primary" onClick={exportCsv}>
                <Download size={13} /> Export CSV
              </button>
            </div>
          }
        />
        <div className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[12px] text-amber">
          <Info size={14} /> Cost model requires UAE supplier quotations.
        </div>
        <Panel title="CAPEX" eyebrow="One-off capital items">
          <div className="flex flex-col">
            {st.capex.map((l) => {
              const excluded = l.optional && !st.includeStandby;
              return (
                <div key={l.id} className={cn('flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-0', excluded && 'opacity-40')}>
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-ink">
                      {l.label} {l.optional && <span className="tag ml-1.5">Optional</span>}
                    </div>
                    <div className="truncate text-[11px] text-muted">{l.note}</div>
                  </div>
                  <QuoteInput value={l.value} onChange={(v) => setLine('capex', l.id, { value: v })} />
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="OPEX" eyebrow="Operating costs — choose the basis of each quote">
          <div className="flex flex-col">
            {st.opex.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink">{l.label}</div>
                  <div className="truncate text-[11px] text-muted">{l.note}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={l.basis}
                    onChange={(e) => setLine('opex', l.id, { basis: e.target.value as Basis })}
                    className="input !w-[132px] !font-sans"
                    aria-label={`${l.label} basis`}
                  >
                    <option value="deployment">per deployment</option>
                    <option value="day">per day</option>
                    <option value="season">per season</option>
                  </select>
                  <QuoteInput value={l.value} onChange={(v) => setLine('opex', l.id, { value: v })} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="flex w-[330px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-deep/40 p-3 [&>*]:shrink-0">
        <Panel title="Operating profile" eyebrow="Inputs" bodyClassName="flex flex-col gap-2.5">
          {(
            [
              ['deployments', 'Deployments per season', 1, 60],
              ['days', 'Days per deployment', 1, 60],
              ['years', 'CAPEX amortisation (years)', 1, 40],
            ] as const
          ).map(([k, label, min, max]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-[12px] text-ink-2">
              {label}
              <input
                type="number"
                className="input !w-[86px] text-right"
                min={min}
                max={max}
                value={st[k]}
                onChange={(e) => setSt((s) => ({ ...s, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) }))}
              />
            </label>
          ))}
          <Toggle checked={st.includeStandby} onChange={(v) => setSt((s) => ({ ...s, includeStandby: v }))} label="Include standby transfer module" hint="Redundant path (L2 fail-safe)" />
        </Panel>
        <Panel title="Results" eyebrow={complete ? 'All lines quoted' : `${calc.capexTbd + calc.opexTbd} of ${calc.total} lines TBD`} bodyClassName="flex flex-col gap-2">
          {(
            [
              ['CAPEX (entered)', calc.capex, calc.capexTbd],
              ['Cost per deployment', calc.perDeployment, calc.opexTbd],
              ['Estimated seasonal cost', calc.seasonal, calc.capexTbd + calc.opexTbd],
            ] as const
          ).map(([label, value, tbd]) => (
            <div key={label} className="panel-flat px-3 py-2.5">
              <div className="text-[11.5px] text-ink-2">{label}</div>
              <div className="num text-[19px] text-ink">{value > 0 ? aed(value) : 'TBD'}</div>
              {tbd > 0 && <div className="text-[10.5px] text-amber">Partial — {tbd} line(s) TBD excluded</div>}
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted">
            Seasonal cost = deployments × (per-deployment + per-day × days) + per-season items + CAPEX ÷ amortisation years. Quotes are stored in this browser
            only.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
