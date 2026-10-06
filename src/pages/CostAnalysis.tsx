import { Calculator, CalendarRange, Download, Info, Minus, Plus, Receipt, RotateCcw, Wallet, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../app/store';
import { PageHeader } from '../components/layout/PageHeader';
import { Toggle } from '../components/ui/Controls';
import { IconTile, Panel, Pill } from '../components/ui/Panel';
import { cn, downloadText } from '../utils/format';

type Basis = 'deployment' | 'day' | 'season';

interface Line {
  id: string;
  label: string;
  note: string;
  value: string;
  /** Marked TBD by the user: kept on screen but excluded from totals. */
  tbd?: boolean;
  basis?: Basis;
  optional?: boolean;
}

const CAPEX: Line[] = [
  { id: 'anchors', label: 'Permanent anchors', note: 'Pre-engineered seabed anchors for all three layouts', value: '' },
  { id: 'curtain', label: 'Curtain modules', note: 'Float line, smooth skirt and ballast — 10 m modules', value: '' },
  { id: 'jets', label: 'Jet manifold & nozzles', note: 'Water channels in the float line and hem with low-velocity nozzles', value: '' },
  { id: 'jetPump', label: 'Jet pump skid', note: 'Low-head pumps with a fish-safe screened intake (~50 kW, first estimate)', value: '' },
  { id: 'popup', label: 'Pop-up system', note: 'Seabed stowage, inflatable float line, compressor and valves', value: '' },
  { id: 'reel', label: 'Deployment reel / handling', note: 'Throat-side reel and winches — workboat option only', value: '' },
  { id: 'sensors', label: 'Sensors', note: 'Sonar / depth monitoring, load cells, flow and occupancy sensing', value: '' },
  { id: 'transferA', label: 'Transfer module A', note: 'Large-aperture low-shear module (technology TBD)', value: '' },
  { id: 'transferB', label: 'Standby transfer module', note: 'Redundant path — first fail-safe', value: '', optional: true },
  { id: 'piping', label: 'Piping', note: 'Floating transfer line, flotation collars, release diffuser', value: '' },
  { id: 'controls', label: 'Controls', note: 'SafeOpen logic, PLC, telemetry, operator HMI', value: '' },
  { id: 'install', label: 'Installation', note: 'Marine works, anchors, commissioning', value: '' },
];

const OPEX: Line[] = [
  { id: 'vessel', label: 'Deployment vessel', note: 'Workboat charter — workboat option only', value: '', basis: 'deployment' },
  { id: 'crew', label: 'Crew', note: 'Marine crew and operator time', value: '', basis: 'day' },
  { id: 'power', label: 'Power', note: 'Transfer module, jet pumps and winches', value: '', basis: 'day' },
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
    const merge = (defs: Line[], s?: Line[]) => defs.map((d) => ({ ...d, ...(s?.find((x) => x.id === d.id) ?? {}), label: d.label, note: d.note, optional: d.optional }));
    return { ...base, ...saved, capex: merge(base.capex, saved.capex), opex: merge(base.opex, saved.opex) };
  } catch {
    return initial();
  }
}

const parse = (v: string): number | null => {
  const n = Number(v.replace(/[,\s]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/** Quote counted in totals: a valid value not marked TBD. */
const counted = (l: Line): number | null => (l.tbd ? null : parse(l.value));

const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-GB')}`;

function QuoteInput({ line, onChange }: { line: Line; onChange: (patch: Partial<Line>) => void }) {
  const bad = line.value.trim() !== '' && parse(line.value) === null;
  return (
    <div className={cn('relative w-[168px] shrink-0 transition-opacity', line.tbd && 'opacity-45')}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[11.5px] font-medium text-dim">AED</span>
      <input
        className={cn('input !h-[40px] !pl-12 text-right !text-[14px]', bad && '!border-red/60')}
        value={line.value}
        placeholder="—"
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value;
          // Typing a first valid quote includes the line again.
          onChange(parse(v) !== null && parse(line.value) === null ? { value: v, tbd: false } : { value: v });
        }}
        aria-label={`${line.label} supplier quote in AED`}
      />
    </div>
  );
}

function TbdBox({ line, onChange }: { line: Line; onChange: (patch: Partial<Line>) => void }) {
  const empty = parse(line.value) === null;
  const checked = empty || !!line.tbd;
  return (
    <label
      className={cn('flex shrink-0 items-center gap-2 text-[12.5px] select-none', empty ? 'cursor-not-allowed text-dim' : 'cursor-pointer text-ink-2')}
      title={empty ? 'No quote entered — excluded from totals' : checked ? 'Marked TBD — excluded from totals' : 'Included in totals — tick to mark TBD'}
    >
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={empty} onChange={(e) => onChange({ tbd: e.target.checked })} />
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-cyan/50',
          checked ? 'border-amber/60 bg-amber/15 text-amber' : 'border-line-strong bg-base/60 text-transparent',
        )}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.6l4.5-5" />
        </svg>
      </span>
      TBD
    </label>
  );
}

function RowNumber({ n }: { n: number }) {
  return <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[12.5px] text-muted">{String(n).padStart(2, '0')}</span>;
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn !h-[34px] !w-[34px] !px-0" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={14} />
      </button>
      <input
        type="number"
        className="input !h-[34px] !w-[58px] text-center !text-[14px]"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        aria-label={label}
      />
      <button type="button" className="btn !h-[34px] !w-[34px] !px-0" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus size={14} />
      </button>
    </div>
  );
}

function ResultTile({ icon, label, value, tbd, info }: { icon: ReactNode; label: string; value: number; tbd: number; info: string }) {
  return (
    <div className="card-inner flex items-start gap-3.5 px-4 py-3.5">
      <IconTile size={40}>{icon}</IconTile>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
          {label}
          <span className="text-muted hover:text-cyan" title={info}>
            <Info size={13} />
          </span>
        </div>
        <div className={cn('num mt-0.5 text-[21px] leading-tight', value > 0 ? 'text-white' : 'text-muted')}>{value > 0 ? aed(value) : 'TBD'}</div>
        {tbd > 0 && (
          <div className="mt-0.5 text-[12px] text-amber">
            {value > 0 ? `Partial — ${tbd} TBD line${tbd > 1 ? 's' : ''} excluded` : `${tbd} line${tbd > 1 ? 's' : ''} awaiting quotes`}
          </div>
        )}
      </div>
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
    const capexVals = capexLines.map(counted);
    const capex = capexVals.reduce<number>((a, v) => a + (v ?? 0), 0);
    const capexTbd = capexVals.filter((v) => v === null).length;
    let perDeployment = 0;
    let perSeasonFixed = 0;
    let opexTbd = 0;
    for (const l of st.opex) {
      const v = counted(l);
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
    return { capex, capexTbd, perDeployment, seasonal: seasonOpex + annualised, opexTbd, total: capexLines.length + st.opex.length };
  }, [st]);

  const setLine = (kind: 'capex' | 'opex', id: string, patch: Partial<Line>) => setSt((s) => ({ ...s, [kind]: s[kind].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const tbdCount = calc.capexTbd + calc.opexTbd;
  const quoted = calc.total - tbdCount;
  const exportCsv = () => {
    const rows = [
      ['category', 'item', 'basis', 'supplier_quote_aed', 'included'],
      ...st.capex.filter((l) => !(l.optional && !st.includeStandby)).map((l) => ['CAPEX', l.label, 'one-off', parse(l.value)?.toString() ?? 'TBD', counted(l) === null ? 'no (TBD)' : 'yes']),
      ...st.opex.map((l) => ['OPEX', l.label, `per ${l.basis}`, parse(l.value)?.toString() ?? 'TBD', counted(l) === null ? 'no (TBD)' : 'yes']),
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
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
        <PageHeader
          eyebrow="Cost Analysis"
          title="Editable Cost Model"
          subtitle="No prices are assumed — enter supplier quotations in AED. Lines marked TBD are excluded from totals."
          right={
            <div className="flex gap-2">
              <button
                type="button"
                className="btn !h-[40px] !px-3.5"
                onClick={() => {
                  setSt(initial());
                  showToast('Cost model cleared', 'info');
                }}
              >
                <RotateCcw size={15} /> Clear
              </button>
              <button type="button" className="btn btn-solid !h-[40px] !px-3.5" onClick={exportCsv}>
                <Download size={15} /> Export CSV
              </button>
            </div>
          }
        />
        <div className="flex items-center gap-2.5 rounded-xl border border-amber/30 bg-amber/[0.06] px-4 py-3 text-[13.5px] text-amber">
          <Info size={16} /> Cost model requires UAE supplier quotations.
        </div>
        <Panel title="CAPEX" subtitle="One-off capital items" icon={<Wallet size={18} />} actions={<span className="text-[12.5px] text-muted">{st.capex.length} categories</span>}>
          <div className="flex flex-col">
            {st.capex.map((l, i) => {
              const excluded = l.optional && !st.includeStandby;
              return (
                <div key={l.id} className={cn('flex items-center gap-4 border-b border-line/60 py-3 last:border-0', excluded && 'opacity-40')}>
                  <RowNumber n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14.5px] text-ink">
                      {l.label}
                      {l.optional && (
                        <Pill tone="muted" dot={false} className="!h-[20px] !px-1.5 !text-[10px]">
                          {excluded ? 'NOT INCLUDED' : 'OPTIONAL'}
                        </Pill>
                      )}
                    </div>
                    <div className="truncate text-[12.5px] text-muted">{l.note}</div>
                  </div>
                  <QuoteInput line={l} onChange={(patch) => setLine('capex', l.id, patch)} />
                  <TbdBox line={l} onChange={(patch) => setLine('capex', l.id, patch)} />
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="OPEX" subtitle="Operating costs — choose the basis of each quote" icon={<Receipt size={18} />} actions={<span className="text-[12.5px] text-muted">{st.opex.length} categories</span>}>
          <div className="flex flex-col">
            {st.opex.map((l, i) => (
              <div key={l.id} className="flex items-center gap-4 border-b border-line/60 py-3 last:border-0">
                <RowNumber n={i + 1} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] text-ink">{l.label}</div>
                  <div className="truncate text-[12.5px] text-muted">{l.note}</div>
                </div>
                <select
                  value={l.basis}
                  onChange={(e) => setLine('opex', l.id, { basis: e.target.value as Basis })}
                  className="input !h-[40px] !w-[150px] !font-sans !text-[13.5px]"
                  aria-label={`${l.label} basis`}
                >
                  <option value="deployment">per deployment</option>
                  <option value="day">per day</option>
                  <option value="season">per season</option>
                </select>
                <QuoteInput line={l} onChange={(patch) => setLine('opex', l.id, patch)} />
                <TbdBox line={l} onChange={(patch) => setLine('opex', l.id, patch)} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <aside className="flex w-[352px] shrink-0 flex-col gap-4 overflow-y-auto py-5 pr-5 min-[1600px]:w-[384px] min-[1600px]:py-6 min-[1600px]:pr-6 [&>*]:shrink-0">
        <Panel title="Operating Profile" subtitle="How often the system is used" icon={<CalendarRange size={18} />} bodyClassName="flex flex-col gap-3.5">
          {(
            [
              ['deployments', 'Deployments per season', 1, 60],
              ['days', 'Days per deployment', 1, 60],
              ['years', 'CAPEX amortisation (years)', 1, 40],
            ] as const
          ).map(([k, label, min, max]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] text-ink-2">{label}</span>
              <Stepper value={st[k]} min={min} max={max} label={label} onChange={(v) => setSt((s) => ({ ...s, [k]: v }))} />
            </div>
          ))}
          <div className="border-t border-line pt-2.5">
            <Toggle checked={st.includeStandby} onChange={(v) => setSt((s) => ({ ...s, includeStandby: v }))} label="Include standby transfer module" hint="Redundant path (secondary fail-safe layer)" />
          </div>
        </Panel>
        <Panel title="Results" subtitle={`${quoted} of ${calc.total} lines quoted`} icon={<Calculator size={18} />} bodyClassName="flex flex-col gap-2.5">
          <div className="h-[6px] overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan/60 to-cyan transition-[width] duration-300" style={{ width: `${(quoted / calc.total) * 100}%` }} />
          </div>
          <ResultTile icon={<Wrench size={18} />} label="CAPEX (entered)" value={calc.capex} tbd={calc.capexTbd} info="Sum of the CAPEX quotes that are entered and not marked TBD." />
          <ResultTile
            icon={<Receipt size={18} />}
            label="Cost per deployment"
            value={calc.perDeployment}
            tbd={calc.opexTbd}
            info="Per-deployment OPEX quotes + per-day quotes × days per deployment."
          />
          <ResultTile
            icon={<CalendarRange size={18} />}
            label="Estimated seasonal cost"
            value={calc.seasonal}
            tbd={tbdCount}
            info="Deployments × cost per deployment + per-season items + CAPEX ÷ amortisation years."
          />
          <p className="text-[12px] leading-relaxed text-muted">Quotes are stored in this browser only. TBD lines never contribute to a total.</p>
        </Panel>
      </aside>
    </div>
  );
}
