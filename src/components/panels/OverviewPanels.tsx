import { Camera, CircleGauge, Play, ShieldCheck, Waves } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { getScene } from '../../app/runtime';
import { useHistory, useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { controller, type StageKey } from '../../simulation/SimController';
import type { CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss, pct } from '../../utils/format';
import { Sparkline } from '../charts/Sparkline';
import { Icon } from '../ui/icons';
import { Bar, Panel, Pill } from '../ui/Panel';

// ---------------------------------------------------------------- performance

type BarTone = 'ok' | 'info' | 'warn' | 'alarm';

function PerfTile({
  icon,
  label,
  value,
  valueTone,
  aside,
  bar,
  barTone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueTone: string;
  aside: ReactNode;
  bar: number;
  barTone: BarTone;
}) {
  return (
    <div className="card-inner flex min-w-0 flex-col gap-1 px-3 pt-2.5 pb-3">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span className="flex shrink-0 text-muted">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <span className={cn('text-[22px] leading-none font-semibold tracking-tight', valueTone)}>{value}</span>
      <span className="truncate text-[11px] text-muted">{aside}</span>
      <div className="mt-0.5">
        <Bar value={bar} tone={barTone} />
      </div>
    </div>
  );
}

/** Real-time SweepLine performance as a compact 2 × 2 tile grid (simulation estimates). */
export function PerformanceRail() {
  const snap = useSnap();
  if (!snap) return null;
  const s = snap.sweepline;
  const b = snap.baseline;
  const eff = s.diversionEfficiency;
  const under = s.underSkirtPct;
  const reduction = b.intakeRatePerMin > 0.05 ? 1 - s.intakeRatePerMin / b.intakeRatePerMin : null;
  const risk = s.screenLoad;
  const load = s.curtainLoad;
  const loadLabel = s.curtainLoadLabel === 'INACTIVE' ? 'Inactive' : s.curtainLoadLabel.charAt(0) + s.curtainLoadLabel.slice(1).toLowerCase();
  return (
    <Panel
      dense
      title="Real-time Performance"
      actions={
        <Pill className="!h-[22px] !text-[10.5px]">
          LIVE
        </Pill>
      }
      bodyClassName="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <PerfTile
          icon={<CircleGauge size={14} />}
          label="Diversion"
          value={pct(eff)}
          valueTone={eff === null ? 'text-muted' : eff >= 0.8 ? 'text-cyan' : eff >= 0.6 ? 'text-amber' : 'text-red'}
          aside="Target ≥ 80%"
          bar={eff ?? 0}
          barTone={eff !== null && eff < 0.6 ? 'alarm' : 'info'}
        />
        <PerfTile
          icon={<Waves size={14} />}
          label="Under-skirt"
          value={pct(under)}
          valueTone={under === null ? 'text-muted' : under <= 0.1 ? 'text-cyan' : under <= 0.2 ? 'text-amber' : 'text-red'}
          aside="Target ≤ 10%"
          bar={Math.min(1, (under ?? 0) * 2.5)}
          barTone={under !== null && under > 0.2 ? 'alarm' : under !== null && under > 0.1 ? 'warn' : 'info'}
        />
        <PerfTile
          icon={<ShieldCheck size={14} />}
          label="Intake risk"
          value={risk}
          valueTone={risk === 'HIGH' ? 'text-red' : risk === 'MEDIUM' ? 'text-amber' : 'text-teal'}
          aside={reduction === null ? 'vs baseline —' : `${pct(-reduction)} vs baseline`}
          bar={risk === 'HIGH' ? 0.9 : risk === 'MEDIUM' ? 0.55 : 0.25}
          barTone={risk === 'HIGH' ? 'alarm' : risk === 'MEDIUM' ? 'warn' : 'ok'}
        />
        <PerfTile
          icon={<Icon name="curtain" size={14} />}
          label="Curtain load"
          value={loadLabel}
          valueTone={s.curtainLoadLabel === 'OVERLOAD' ? 'text-red' : s.curtainLoadLabel === 'HIGH' ? 'text-amber' : s.curtainLoadLabel === 'INACTIVE' ? 'text-muted' : 'text-teal'}
          aside={`${(load * 100).toFixed(0)}% of limit`}
          bar={Math.min(1, load)}
          barTone={load >= 1 ? 'alarm' : load >= 0.8 ? 'warn' : 'ok'}
        />
      </div>
      <p className="px-0.5 text-[11px] text-dim">Simulation estimates (same seed as baseline) — not field-validated.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------- timeline

export const TIMELINE_STAGES: Array<{ key: StageKey; label: string; sub: string; short: string }> = [
  { key: 'bloom', label: 'Bloom', sub: 'Approach', short: 'Bloom' },
  { key: 'warning', label: 'Warning', sub: 'Received', short: 'Warning' },
  { key: 'deploy', label: 'Deploy', sub: 'System', short: 'Deploy' },
  { key: 'sweep', label: 'Sweep', sub: '& Divert', short: 'Sweep' },
  { key: 'transfer', label: 'Transfer', sub: 'Live', short: 'Transfer' },
  { key: 'release', label: 'Safe', sub: 'Release', short: 'Release' },
  { key: 'recovery', label: 'Recovery', sub: '/ Standby', short: 'Recovery' },
];

/** Seven-stage sequence track. `sm` is the slim variant used in the viewport bottom strip. */
export function TimelineTrack({ compact, size = 'md' }: { compact?: boolean; size?: 'md' | 'sm' }) {
  const snap = useSnap();
  if (!snap) return null;
  const sm = size === 'sm';
  const order = snap.timeline.map((s) => s.key);
  const curIdx = order.indexOf(snap.stage);
  const lineTop = sm ? 12 : 17;
  const n = TIMELINE_STAGES.length;
  return (
    <div className="@container relative flex items-start justify-between">
      {/* Line runs between the first and last circle centres (each stage column is 1/n wide). */}
      <div className="absolute h-[2px] bg-[rgba(150,200,220,0.12)]" style={{ top: lineTop, left: `calc(100% / ${2 * n})`, right: `calc(100% / ${2 * n})` }} />
      <div
        className="absolute h-[2px] bg-gradient-to-r from-cyan/70 to-cyan transition-[width] duration-500"
        style={{ top: lineTop, left: `calc(100% / ${2 * n})`, width: `calc(100% * ${Math.max(0, curIdx)} / ${n})` }}
      />
      {TIMELINE_STAGES.map((s, i) => {
        const at = snap.timeline.find((t) => t.key === s.key)?.at ?? null;
        const reached = at !== null;
        const current = i === curIdx;
        return (
          <div key={s.key} className="relative z-10 flex flex-1 flex-col items-center text-center">
            <div
              className={cn(
                'flex items-center justify-center rounded-full border-2 font-semibold transition-all duration-300',
                sm ? 'h-[26px] w-[26px] text-[12px]' : 'h-9 w-9 text-[13.5px]',
                current
                  ? cn('border-cyan bg-cyan text-[#03121a]', sm ? 'shadow-[0_0_0_4px_rgba(34,211,238,0.16),0_0_14px_rgba(34,211,238,0.5)]' : 'shadow-[0_0_0_5px_rgba(34,211,238,0.16),0_0_18px_rgba(34,211,238,0.55)]')
                  : reached
                    ? 'border-cyan/70 bg-[#0b1d2a] text-cyan'
                    : 'border-[rgba(150,200,220,0.22)] bg-[#0b1520] text-muted',
              )}
            >
              {i + 1}
            </div>
            {sm ? (
              <div className={cn('mt-1.5 text-[11.5px] leading-tight', current ? 'font-semibold text-white' : reached ? 'text-ink' : 'text-muted')}>{s.short}</div>
            ) : (
              <div className={cn('mt-2 text-[12.5px] leading-tight @max-[460px]:text-[11.5px]', current ? 'font-semibold text-white' : reached ? 'text-ink' : 'text-muted')}>
                {compact ? s.short : s.label}
                {!compact && <div className={cn('text-[12px] @max-[400px]:hidden @max-[460px]:text-[11px]', current ? 'text-ink' : 'text-muted')}>{s.sub}</div>}
              </div>
            )}
            <div className={cn('num', sm ? 'mt-0.5 text-[10.5px]' : 'mt-1.5 text-[11.5px]', current ? 'text-cyan' : 'text-dim')}>{at === null ? '--:--' : mmss(at)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TimelineCard() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const order = snap.timeline.map((s) => s.key);
  const phase = order.indexOf(snap.stage) + 1;
  return (
    <section className="card flex min-h-0 flex-col justify-between px-4 pt-3 pb-3">
      <header className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            void controller.restart('sequence');
            showToast('Replaying the sequence from bloom approach (same seed)', 'info');
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan/40 bg-cyan/10 text-cyan transition-colors hover:bg-cyan/20"
          title="Replay the full sequence from bloom approach (same seed)"
        >
          <Play size={12} className="translate-x-[1px]" fill="currentColor" />
        </button>
        <h3 className="card-title flex-1 truncate !text-[15px]">Simulation Timeline</h3>
        <span className="text-[12px] whitespace-nowrap text-muted">
          Phase {phase} of {order.length}
        </span>
      </header>
      <TimelineTrack size="sm" />
    </section>
  );
}

// ---------------------------------------------------------------- key metrics

function MiniMetric({
  title,
  short,
  value,
  unit,
  sub,
  tone,
  children,
}: {
  title: string;
  /** Title used when the tile is narrow. */
  short: string;
  value: string;
  unit?: string;
  sub: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="@container card-inner flex min-w-0 flex-col px-3 pt-2 pb-1.5">
      <span className="truncate text-[12px] text-ink-2" title={title}>
        <span className="@max-[150px]:hidden">{title}</span>
        <span className="hidden @max-[150px]:inline">{short}</span>
      </span>
      <span className={cn('num mt-0.5 truncate text-[19px] leading-tight font-medium @max-[130px]:text-[16px]', tone)}>
        {value}
        {unit && <span className="ml-1 text-[11.5px] text-ink-2 @max-[130px]:text-[10.5px]">{unit}</span>}
      </span>
      <span className="truncate text-[11px] text-muted" title={sub}>
        {sub}
      </span>
      <div className="mt-auto pt-1">{children}</div>
    </div>
  );
}

export function KeyMetricsCard() {
  const snap = useSnap();
  const hist = useHistory(90);
  if (!snap) return null;
  const s = snap.sweepline;
  const b = snap.baseline;
  const reduction = b.intakeRatePerMin > 0.05 ? 1 - s.intakeRatePerMin / b.intakeRatePerMin : null;
  const flow = s.transferFlowM3h * Math.min(1, s.transferUtilisation ?? 0);
  const status = snap.status;
  return (
    <Panel
      dense
      title="Key Metrics"
      actions={
        <Pill className="!h-[22px] !text-[10.5px]">
          LIVE
        </Pill>
      }
      bodyClassName="grid grid-cols-3 gap-2"
    >
      <MiniMetric
        title="Jellyfish at Intake"
        short="At intake"
        value={reduction === null ? `${s.intakeRatePerMin.toFixed(1)}` : pct(-reduction)}
        sub={reduction === null ? 'per minute' : 'vs baseline'}
        tone={reduction !== null && reduction > 0.5 ? 'text-teal' : 'text-amber'}
      >
        <Sparkline data={hist.map((h) => h.sRate)} secondary={hist.map((h) => h.bRate)} color="#1AA3BE" height={22} min={0} />
      </MiniMetric>
      <MiniMetric
        title="Transfer Flow"
        short="Transfer"
        value={`${Math.round(flow)}`}
        unit="m³/h"
        sub={s.transferUtilisation === null ? 'idle' : `${Math.round(Math.min(1, s.transferUtilisation) * 100)}% of capacity`}
        tone="text-cyan"
      >
        <Sparkline data={hist.map((h) => h.flow)} color="#22d3ee" height={22} min={0} />
      </MiniMetric>
      <MiniMetric
        title="System Status"
        short="Status"
        value={status.label === 'Nominal' ? 'Normal' : status.label}
        sub={status.detail}
        tone={status.tone === 'alarm' ? 'text-red' : status.tone === 'warn' ? 'text-amber' : status.tone === 'info' ? 'text-cyan' : 'text-amber/90'}
      >
        <Sparkline data={hist.map((h) => h.load * 100)} color="#f5b94c" height={22} min={0} />
      </MiniMetric>
    </Panel>
  );
}

// ---------------------------------------------------------------- camera views

const VIEWS: Array<{ key: string; preset: Exclude<CameraPreset, 'free'>; label: string; title: string }> = [
  { key: 'thumb-aerial', preset: 'aerial', label: 'Aerial', title: 'Aerial view' },
  { key: 'thumb-underwater', preset: 'underwater', label: 'Underwater', title: 'Underwater curtain' },
  { key: 'thumb-intake', preset: 'intake', label: 'Intake', title: 'Intake screens' },
  { key: 'thumb-throat', preset: 'throat', label: 'Throat', title: 'Recovery throat' },
];

function Thumb({ k, preset, label, title }: { k: string; preset: Exclude<CameraPreset, 'free'>; label: string; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const camera = useApp((s) => s.ui.camera);
  const setCamera = useApp((s) => s.setCamera);
  const setUI = useApp((s) => s.setUI);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    getScene().registerThumbnail(k, c, preset);
    return () => getScene().unregisterThumbnail(k);
  }, [k, preset]);
  // The scene sizes each feed to its tile before rendering; re-render promptly when the tile changes size.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => getScene().refreshThumbnail(k));
    ro.observe(box);
    return () => ro.disconnect();
  }, [k]);
  const active = camera === preset;
  return (
    <button
      ref={boxRef}
      type="button"
      onClick={() => {
        setUI({ compare: false });
        setCamera(preset);
      }}
      className={cn(
        'group relative h-full min-h-0 w-full overflow-hidden rounded-xl border bg-[#0a1a24] transition-all duration-200',
        active ? 'border-cyan/80 shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_0_18px_rgba(34,211,238,0.25)]' : 'border-line-strong hover:border-cyan/45',
      )}
      title={`Switch the 3D camera to ${title.toLowerCase()}`}
    >
      <canvas ref={ref} width={320} height={240} className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pt-5 pb-1.5 text-[12px] font-medium text-white">
        <Camera size={13} /> {label}
      </div>
    </button>
  );
}

/**
 * All four live camera feeds; clicking one moves the main 3D camera there.
 * A 2 × 2 grid in the narrow rail; on wide screens one column that fills the rail height.
 */
export function CameraViewsCard() {
  return (
    <Panel
      dense
      className="min-[1600px]:flex-1"
      title="Camera Views"
      actions={
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-green" /> Live feeds
        </span>
      }
      bodyClassName="@container flex flex-col"
    >
      {/* Narrow rail: rows are 44% of the card width (landscape tiles). Wide: four rows share the height. */}
      <div className="grid flex-1 grid-cols-2 gap-2 [grid-template-rows:repeat(2,44cqw)] min-[1600px]:grid-cols-1 min-[1600px]:[grid-template-rows:repeat(4,minmax(72px,1fr))]">
        {VIEWS.map((v) => (
          <Thumb key={v.key} k={v.key} preset={v.preset} label={v.label} title={v.title} />
        ))}
      </div>
    </Panel>
  );
}
