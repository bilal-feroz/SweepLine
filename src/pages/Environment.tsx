import { Anchor, ArrowDownToLine, ArrowUpDown, BarChart3, BookOpen, Compass, Layers, MoveVertical, Route, ShieldCheck, SlidersHorizontal, Waves, Wind } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { SERIES } from '../components/charts/TimeChart';
import { PageHeader } from '../components/layout/PageHeader';
import { Segmented, Slider } from '../components/ui/Controls';
import { Icon } from '../components/ui/icons';
import { Panel, Pill } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE, type EnvelopeKey } from '../config/operatingEnvelope';
import { compassLabel } from '../config/site';
import { S_APPROACHING, S_GUIDED } from '../simulation/Agent';
import type { ConstraintStatus } from '../simulation/safety';
import { controller } from '../simulation/SimController';
import { ANCHOR_ANGLES, type AnchorAngle } from '../simulation/types';
import { cn, num, pct } from '../utils/format';

/** Standard normal CDF (Abramowitz–Stegun). */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

const BIN = 0.25;
const MAX_DEPTH = 6;
const TICK = { fill: '#7992A0', fontSize: 11.5 };

function useDepthHistogram() {
  const [bins, setBins] = useState<Array<{ depth: number; label: string; share: number; model: number }>>([]);
  const snap = useSnap();
  const mean = snap?.params.bloomMeanDepth ?? 1.8;
  const sd = snap?.params.bloomDepthSD ?? 0.8;
  useEffect(() => {
    const read = () => {
      const p = controller.sweepline.pool;
      const counts = new Array(Math.round(MAX_DEPTH / BIN)).fill(0);
      let n = 0;
      for (let i = 0; i < p.capacity; i++) {
        const st = p.state[i];
        if (st !== S_APPROACHING && st !== S_GUIDED) continue;
        const k = Math.min(counts.length - 1, Math.max(0, Math.floor(-p.py[i] / BIN)));
        counts[k]++;
        n++;
      }
      setBins(
        counts.map((c, k) => {
          const lo = k * BIN;
          const hi = lo + BIN;
          return { depth: lo + BIN / 2, label: `${lo.toFixed(2)}–${hi.toFixed(2)} m`, share: n ? (c / n) * 100 : 0, model: (phi((hi - mean) / sd) - phi((lo - mean) / sd)) * 100 };
        }),
      );
    };
    read();
    const id = setInterval(read, 1500);
    return () => clearInterval(id);
  }, [mean, sd]);
  return bins;
}

// ---------------------------------------------------------------- inputs

function InputsCard() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  const E = OPERATING_ENVELOPE;
  return (
    <Panel title="Simulation Inputs" subtitle="Hydrodynamic conditions" icon={<SlidersHorizontal size={18} />} bodyClassName="flex flex-col gap-5 pt-1">
      <Slider
        icon={<Wind size={16} />}
        label="Current speed"
        value={p.currentSpeed}
        min={0.05}
        max={0.9}
        step={0.01}
        display={`${p.currentSpeed.toFixed(2)} m/s`}
        tone={p.currentSpeed > E.currentSpeed.max ? 'red' : p.currentSpeed > E.currentSpeed.near ? 'amber' : undefined}
        marker={{ value: E.currentSpeed.max, label: 'Assumed envelope limit' }}
        ends={['0.05', '0.90 m/s']}
        onChange={(v) => controller.setParams({ currentSpeed: v })}
      />
      <Slider
        icon={<Compass size={16} />}
        label="Current direction"
        value={p.currentBearing}
        min={92}
        max={132}
        step={1}
        display={`${compassLabel(p.currentBearing)} ${p.currentBearing.toFixed(0)}°`}
        ends={['92°', '132°']}
        hint="Changes the effective current–curtain angle of the fixed anchors"
        onChange={(v) => controller.setParams({ currentBearing: v })}
      />
      <Slider
        icon={<Waves size={16} />}
        label="Wave height (Hs)"
        value={p.waveHeight}
        min={0.1}
        max={2.5}
        step={0.05}
        display={`${p.waveHeight.toFixed(2)} m`}
        tone={p.waveHeight > E.waveHeight.max ? 'red' : p.waveHeight > E.waveHeight.near ? 'amber' : undefined}
        marker={{ value: E.waveHeight.max, label: 'Assumed envelope limit' }}
        ends={['0.1', '2.5 m']}
        onChange={(v) => controller.setParams({ waveHeight: v })}
      />
      <p className="text-[12px] leading-relaxed text-dim">Red ticks mark the assumed envelope limits.</p>
    </Panel>
  );
}

function BloomCard() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  return (
    <Panel title="Bloom Parameters" subtitle="Density and vertical distribution" icon={<Icon name="jellyfish" size={19} />} bodyClassName="flex flex-col gap-5 pt-1">
      <Slider
        icon={<Layers size={16} />}
        label="Bloom density"
        value={p.bloomDensity}
        min={0.1}
        max={1}
        step={0.01}
        display={`${Math.round(p.bloomDensity * 100)}%`}
        ends={['10%', '100%']}
        onChange={(v) => controller.setParams({ bloomDensity: v })}
      />
      <Slider
        icon={<ArrowDownToLine size={16} />}
        label="Mean depth"
        value={p.bloomMeanDepth}
        min={0.5}
        max={4.5}
        step={0.1}
        display={`${p.bloomMeanDepth.toFixed(1)} m`}
        tone={snap.bloom.p90 > p.skirtDepth ? 'amber' : undefined}
        ends={['0.5', '4.5 m']}
        onChange={(v) => controller.setParams({ bloomMeanDepth: v })}
      />
      <Slider
        icon={<MoveVertical size={16} />}
        label="Depth spread (σ)"
        value={p.bloomDepthSD}
        min={0.2}
        max={1.5}
        step={0.05}
        display={`${p.bloomDepthSD.toFixed(2)} m`}
        ends={['0.2', '1.5 m']}
        onChange={(v) => controller.setParams({ bloomDepthSD: v })}
      />
      <div className="card-inner px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
        Reference conditions <span className="num text-ink-2">{p.waterTemp.toFixed(1)} °C</span> · <span className="num text-ink-2">{p.salinity.toFixed(1)} PSU</span> —
        recorded with exported runs, not used by the agent model.
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- bloom depth

function StatTile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="card-inner min-w-0 px-3.5 py-3">
      <div className="flex items-start gap-1.5 text-[12px] leading-tight text-muted">
        <span className={cn('mt-px flex shrink-0', tone === 'amber' ? 'text-amber' : 'text-cyan')}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={cn('num mt-1 text-[21px] leading-tight', tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</div>
    </div>
  );
}

function DepthCard() {
  const snap = useSnap();
  const bins = useDepthHistogram();
  if (!snap) return null;
  const p = snap.params;
  const skirt = snap.curtain.skirtActual;
  const below = 1 - phi((skirt - p.bloomMeanDepth) / p.bloomDepthSD);
  const under = snap.sweepline.underSkirtPct;
  // Keep the two line labels on opposite sides of their lines.
  const p90Above = snap.bloom.p90 <= skirt;
  return (
    <Panel
      title="Bloom Depth Distribution"
      subtitle="Live agents approaching or guided, against the skirt"
      icon={<BarChart3 size={18} />}
      actions={
        <span className="flex items-center gap-3 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES.sweepline }} /> Agents
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3.5 bg-ink" /> Skirt
          </span>
        </span>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <div className="relative h-[290px]">
        <span className="pointer-events-none absolute top-0 left-1 text-[11.5px] text-muted">Depth ↓</span>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} layout="vertical" margin={{ top: 20, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="rgba(150,200,220,0.08)" horizontal={false} />
            <XAxis type="number" tick={TICK} tickFormatter={(v: number) => `${v.toFixed(0)}%`} stroke="rgba(150,200,220,0.18)" tickLine={false} />
            <YAxis
              type="number"
              dataKey="depth"
              domain={[0, MAX_DEPTH]}
              ticks={[0, 1, 2, 3, 4, 5, 6]}
              tickFormatter={(v: number) => `${v} m`}
              tick={TICK}
              stroke="rgba(150,200,220,0.18)"
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'rgba(231,241,245,0.05)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const row = payload[0].payload as { label: string; share: number; model: number };
                return (
                  <div className="glass px-3 py-2 text-[12px]">
                    <div className="num text-muted">{row.label}</div>
                    <div className="text-ink">Simulated {row.share.toFixed(1)}%</div>
                    <div className="text-ink-2">Model {row.model.toFixed(1)}%</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="share" fill={SERIES.sweepline} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={9} />
            <ReferenceLine
              y={skirt}
              stroke="#e7f1f5"
              strokeWidth={1.6}
              label={{ value: `Skirt ${skirt.toFixed(1)} m`, fill: '#e7f1f5', fontSize: 12, position: p90Above ? 'insideTopRight' : 'insideBottomRight' }}
            />
            <ReferenceLine
              y={snap.bloom.p90}
              stroke="rgba(150,200,220,0.6)"
              strokeDasharray="4 4"
              label={{ value: `P90 ${snap.bloom.p90.toFixed(1)} m`, fill: '#B9CBD3', fontSize: 11.5, position: p90Above ? 'insideBottomRight' : 'insideTopRight' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={<ArrowDownToLine size={14} />} label="Below skirt (model)" value={pct(below, 1)} tone={below > 0.15 ? 'amber' : undefined} />
        <StatTile icon={<Waves size={14} />} label="Under-skirt escape" value={pct(under, 1)} tone={under !== null && under > 0.1 ? 'amber' : undefined} />
        <StatTile icon={<Wind size={14} />} label="Skirt blow-back" value={`${num(snap.curtain.liftAngle, 1)}°`} />
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        Simulated escape exceeds the static share below the skirt: flow diving under the skirt, vertical mixing and wave heave move guided jellyfish
        downward — the adjustable-skirt trade-off.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------- anchor layout

function GeometryDiagram({ angle, u, un, ut }: { angle: number; u: number; un: number; ut: number }) {
  const a = (angle * Math.PI) / 180;
  const x0 = 34;
  const y0 = 150;
  const L = 250;
  const x1 = x0 + L * Math.cos(a);
  const y1 = y0 - L * Math.sin(a);
  const px = x0 + 0.52 * L * Math.cos(a);
  const py = y0 - 0.52 * L * Math.sin(a);
  const V = 78;
  const tx = px + V * Math.cos(a) * Math.cos(a);
  const ty = py - V * Math.cos(a) * Math.sin(a);
  const nx = px + V * Math.sin(a) * Math.sin(a);
  const ny = py + V * Math.sin(a) * Math.cos(a);
  const arc = 46;
  return (
    <svg viewBox="0 0 320 172" className="h-auto w-full" role="img" aria-label={`Curtain at ${angle.toFixed(0)}° to the current, velocity split into sweeping and blocked components`}>
      <defs>
        {(
          [
            ['ah-c', '#22d3ee'],
            ['ah-t', '#2dd4bf'],
            ['ah-a', '#f5b94c'],
          ] as const
        ).map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={c} />
          </marker>
        ))}
      </defs>
      {[30, 54, 78].map((y) => (
        <line key={y} x1={10} y1={y} x2={78} y2={y} stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="1.6" markerEnd="url(#ah-c)" />
      ))}
      <text x={10} y={18} fill="#7992A0" fontSize="11">
        Current
      </text>
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => (
        <circle key={i} cx={x0 + (L * Math.cos(a) * i) / 10} cy={y0 - (L * Math.sin(a) * i) / 10} r="2.6" fill="#fbbf24" />
      ))}
      <text x={x1 + 4} y={y1 + 22} fill="#f5b94c" fontSize="11" textAnchor="end">
        Guide curtain → throat
      </text>
      <path d={`M${x0 + arc} ${y0} A${arc} ${arc} 0 0 0 ${x0 + arc * Math.cos(a)} ${y0 - arc * Math.sin(a)}`} fill="none" stroke="#B9CBD3" strokeOpacity="0.7" />
      <line x1={x0} y1={y0} x2={x0 + arc + 26} y2={y0} stroke="#B9CBD3" strokeOpacity="0.35" strokeDasharray="3 3" />
      <text x={x0 + arc + 6} y={y0 - 6} fill="#e7f1f5" fontSize="12" fontWeight="600">
        {angle.toFixed(0)}°
      </text>
      <line x1={px} y1={py} x2={px + V} y2={py} stroke="#22d3ee" strokeWidth="2" markerEnd="url(#ah-c)" />
      <line x1={tx} y1={ty} x2={px + V} y2={py} stroke="#7992A0" strokeDasharray="3 3" />
      <line x1={nx} y1={ny} x2={px + V} y2={py} stroke="#7992A0" strokeDasharray="3 3" />
      <line x1={px} y1={py} x2={tx} y2={ty} stroke="#2dd4bf" strokeWidth="2.2" markerEnd="url(#ah-t)" />
      <line x1={px} y1={py} x2={nx} y2={ny} stroke="#f5b94c" strokeWidth="2.2" markerEnd="url(#ah-a)" />
      <text x={px + V + 6} y={py + 4} fill="#22d3ee" fontSize="11.5">
        U {u.toFixed(2)}
      </text>
      <text x={(px + tx) / 2 - 18 * Math.sin(a)} y={(py + ty) / 2 - 18 * Math.cos(a)} fill="#2dd4bf" fontSize="11.5" textAnchor="end">
        Uₜ {ut.toFixed(2)} sweep
      </text>
      <text x={nx + 4} y={ny + 15} fill="#f5b94c" fontSize="11.5">
        Uₙ {un.toFixed(2)} into curtain
      </text>
    </svg>
  );
}

function AnchorLayoutCard() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const deployed = c.mode !== 'STOWED';
  const ut = p.currentSpeed * Math.cos((c.attackAngle * Math.PI) / 180);
  const setAngle = (a: AnchorAngle) => {
    if (a === p.anchorAngle) return;
    if (deployed) showToast(`Angle is fixed while deployed — restarting the run on the ${a}° anchors (same seed)`, 'warn');
    void controller.selectAnchorLayout(a);
  };
  const rows: Array<[string, string]> = [
    ['Effective angle to current', `${c.attackAngle.toFixed(0)}°`],
    ['Normal velocity (into curtain)', `${c.normalVelocity.toFixed(3)} m/s`],
    ['Tangential velocity (sweep)', `${ut.toFixed(3)} m/s`],
    ['Curtain length', `${c.length.toFixed(0)} m`],
    ['Est. traverse time (current only)', `${(c.length / Math.max(ut, 0.01) / 60).toFixed(1)} min`],
    ['Seabed-limited max skirt', `${c.clearanceMax.toFixed(1)} m`],
    ['Conveyor jets at the face', c.jetOutput > 0.01 ? `+${c.jetConveyor.toFixed(2)} m/s` : 'off'],
    ['Jet water flow', c.jetOutput > 0.01 ? `${c.jetFlowM3s.toFixed(1)} m³/s` : 'off'],
  ];
  return (
    <Panel
      title="Selected Anchor Layout"
      subtitle="Pre-engineered layouts — fixed while deployed"
      icon={<Anchor size={18} />}
      actions={
        <Segmented
          size="sm"
          value={p.anchorAngle}
          onChange={setAngle}
          options={ANCHOR_ANGLES.map((a) => ({ value: a, label: `${a}°`, title: deployed && a !== p.anchorAngle ? `Selecting ${a}° restarts the run and redeploys` : `${a}° anchor layout` }))}
        />
      }
      bodyClassName="flex flex-col gap-4"
    >
      <div className="card-inner px-3 py-2">
        <GeometryDiagram angle={c.attackAngle} u={p.currentSpeed} un={c.normalVelocity} ut={ut} />
      </div>
      <div className="grid grid-cols-2 gap-x-6">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col border-b border-line/70 py-2">
            <span className="truncate text-[12px] text-muted">{k}</span>
            <span className="num text-[14px] text-ink">{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        A shallow angle keeps the blocking component small and the sweeping component large: incoming flow becomes lateral flow along the curtain, and the
        conveyor jets add their own along-face current so the sweep continues when the natural current is weak.
        Redirect gain {ASSUMPTIONS.curtain.redirectGain}, entrainment gain {ASSUMPTIONS.curtain.entrainmentGain} (design assumptions).
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------- envelope

const ENV_ICON: Record<EnvelopeKey, ReactNode> = {
  currentSpeed: <Wind size={16} />,
  waveHeight: <Waves size={16} />,
  attackAngle: <Compass size={16} />,
  bloomDepth: <Icon name="jellyfish" size={17} />,
  seabedClearance: <ArrowUpDown size={16} />,
  curtainLoad: <Icon name="curtain" size={17} />,
  transferUtilisation: <Icon name="transfer" size={17} />,
  throatOccupancy: <Icon name="throat" size={17} />,
  transferPath: <Route size={16} />,
};

const STATUS_TEXT: Record<ConstraintStatus, string> = { ok: 'text-teal', near: 'text-amber', out: 'text-red', na: 'text-dim' };
const STATUS_DOT: Record<ConstraintStatus, string> = { ok: 'bg-teal', near: 'bg-amber', out: 'bg-red', na: 'bg-dim' };

function EnvelopeCard() {
  const snap = useSnap();
  if (!snap) return null;
  const env = snap.envelope;
  const rec = env.recommendation;
  const bad = rec === 'DO NOT DEPLOY' || rec === 'INITIATE SAFEOPEN' || rec === 'HOLD — BASELINE PROTECTION';
  const warn = rec === 'INCREASE SKIRT DEPTH' || rec === 'MONITOR';
  return (
    <Panel
      title="Operating Envelope"
      subtitle="Assumed thresholds — pending validation"
      icon={<ShieldCheck size={18} />}
      iconTone={env.within ? 'teal' : 'red'}
      actions={
        <Pill tone={env.within ? 'green' : 'red'} dot={false}>
          {env.satisfied}/{env.total}
        </Pill>
      }
      bodyClassName="flex flex-col gap-1.5"
    >
      {!env.within && (
        <div className="mb-1 rounded-xl border border-red/40 bg-red/[0.08] px-3 py-2 text-[12px] font-semibold tracking-[0.05em] text-red">
          OUTSIDE VALIDATED OPERATING ENVELOPE
        </div>
      )}
      {env.constraints.map((c) => (
        <div key={c.key} className="flex items-center gap-3 border-b border-line/60 py-2 last:border-0">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]', c.status === 'na' ? 'text-dim' : 'text-ink-2')}>
            {ENV_ICON[c.key]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13.5px] text-ink">
              <span className="truncate">{c.label}</span>
              {c.kind === 'advisory' && <span className="text-[10.5px] tracking-wide text-dim uppercase">advisory</span>}
            </span>
            <span className="num block text-[11.5px] text-dim">{c.limit}</span>
          </span>
          <span className={cn('num flex shrink-0 items-center gap-2 text-[13px]', STATUS_TEXT[c.status])}>
            {c.value}
            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[c.status])} />
          </span>
        </div>
      ))}
      <div
        className={cn(
          'mt-2 flex flex-col gap-0.5 rounded-xl border px-3.5 py-3',
          bad ? 'border-red/40 bg-red/[0.08]' : warn ? 'border-amber/35 bg-amber/[0.07]' : 'border-teal/30 bg-teal/[0.06]',
        )}
      >
        <span className="text-[12.5px] text-muted">Recommended action</span>
        <span className={cn('text-[13px] font-semibold tracking-[0.03em]', bad ? 'text-red' : warn ? 'text-amber' : 'text-teal')}>{rec}</span>
      </div>
    </Panel>
  );
}

function DesignRuleCard() {
  const rules: ReactNode[] = [
    <>
      <span className="text-ink">Hard limits</span> block deployment and, if exceeded for {ASSUMPTIONS.safeOpen.violationDwell} s during operation, trigger
      SafeOpen automatically.
    </>,
    <>
      <span className="text-ink">Advisory limits</span> (bloom deeper than the skirt) recommend action — SweepLine would be ineffective, not unsafe.
    </>,
    <>Thresholds are design assumptions pending flume calibration and a coastal pilot (see Validation).</>,
    <>Outside the envelope the visualiser reports it plainly — it never fakes success.</>,
  ];
  return (
    <Panel title="Design Rule" subtitle="How the envelope is used" icon={<BookOpen size={18} />}>
      <ol className="flex flex-col gap-3">
        {rules.map((r, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-ink-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan/40 bg-cyan/10 text-[12px] font-semibold text-cyan">{i + 1}</span>
            <span>{r}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function Environment() {
  const snap = useSnap();
  const scenario = useMemo(() => snap?.scenarioName, [snap?.scenarioName]);
  if (!snap) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Environment"
        title="Site Conditions & Bloom"
        subtitle={`Simulation inputs for the reference coastal intake — schematic, not ENEC facility data · ${scenario}`}
      />
      <div className="grid grid-cols-[minmax(0,0.86fr)_minmax(0,1.3fr)_minmax(0,0.98fr)] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <InputsCard />
          <BloomCard />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <DepthCard />
          <AnchorLayoutCard />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <EnvelopeCard />
          <DesignRuleCard />
        </div>
      </div>
    </div>
  );
}
