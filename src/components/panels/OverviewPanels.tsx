import { Camera, ChevronLeft, ChevronRight, CircleGauge, Play, ShieldCheck, Waves } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getScene } from '../../app/runtime';
import { useHistory, useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { controller, type StageKey } from '../../simulation/SimController';
import type { CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss, pct } from '../../utils/format';
import { Sparkline } from '../charts/Sparkline';
import { Icon } from '../ui/icons';
import { Bar, IconTile, Panel, Pill, type TileTone } from '../ui/Panel';

// ---------------------------------------------------------------- performance rail

function RailMetric({
  icon,
  tone = 'cyan',
  label,
  value,
  valueTone,
  aside,
  bar,
  barTone,
  compact,
}: {
  icon: ReactNode;
  tone?: TileTone;
  label: string;
  value: string;
  valueTone: string;
  aside: ReactNode;
  bar: number;
  barTone: 'ok' | 'info' | 'warn' | 'alarm';
  compact?: boolean;
}) {
  return (
    <div className={cn('card-inner flex items-center gap-4 px-4', compact ? 'py-3' : 'py-4')}>
      <IconTile size={compact ? 44 : 50} tone={tone}>
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] text-ink">{label}</div>
        <div className="mt-0.5 flex items-end justify-between gap-2">
          <span className={cn('leading-none font-semibold tracking-tight', compact ? 'text-[26px]' : 'text-[30px]', valueTone)}>{value}</span>
          <span className="pb-0.5 text-right text-[12.5px] text-muted">{aside}</span>
        </div>
        <div className="mt-2.5">
          <Bar value={bar} tone={barTone} thick />
        </div>
      </div>
    </div>
  );
}

/** Real-time SweepLine performance (simulation estimates). */
export function PerformanceRail({ compact }: { compact?: boolean }) {
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
      bodyClassName="flex flex-col gap-2.5"
    >
      <RailMetric
        compact={compact}
        icon={<CircleGauge size={26} strokeWidth={1.5} />}
        label="Diversion Efficiency"
        value={pct(eff)}
        valueTone={eff === null ? 'text-muted' : eff >= 0.8 ? 'text-cyan' : eff >= 0.6 ? 'text-amber' : 'text-red'}
        aside="Target ≥ 80%"
        bar={eff ?? 0}
        barTone={eff !== null && eff < 0.6 ? 'alarm' : 'info'}
      />
      <RailMetric
        compact={compact}
        icon={<Waves size={26} strokeWidth={1.5} />}
        label="Under-skirt Escape"
        value={pct(under)}
        valueTone={under === null ? 'text-muted' : under <= 0.1 ? 'text-cyan' : under <= 0.2 ? 'text-amber' : 'text-red'}
        aside="Target ≤ 10%"
        bar={Math.min(1, (under ?? 0) * 2.5)}
        barTone={under !== null && under > 0.2 ? 'alarm' : under !== null && under > 0.1 ? 'warn' : 'info'}
      />
      <RailMetric
        compact={compact}
        icon={<ShieldCheck size={26} strokeWidth={1.5} />}
        tone={risk === 'HIGH' ? 'red' : risk === 'MEDIUM' ? 'amber' : 'teal'}
        label="Intake Risk"
        value={risk}
        valueTone={risk === 'HIGH' ? 'text-red' : risk === 'MEDIUM' ? 'text-amber' : 'text-teal'}
        aside={reduction === null ? 'vs baseline —' : `${pct(-reduction)} vs baseline`}
        bar={risk === 'HIGH' ? 0.9 : risk === 'MEDIUM' ? 0.55 : 0.25}
        barTone={risk === 'HIGH' ? 'alarm' : risk === 'MEDIUM' ? 'warn' : 'ok'}
      />
      <RailMetric
        compact={compact}
        icon={<Icon name="curtain" size={26} strokeWidth={1.5} />}
        tone={s.curtainLoadLabel === 'OVERLOAD' ? 'red' : s.curtainLoadLabel === 'HIGH' ? 'amber' : 'teal'}
        label="Curtain Load"
        value={loadLabel}
        valueTone={s.curtainLoadLabel === 'OVERLOAD' ? 'text-red' : s.curtainLoadLabel === 'HIGH' ? 'text-amber' : s.curtainLoadLabel === 'INACTIVE' ? 'text-muted' : 'text-teal'}
        aside={`${(load * 100).toFixed(0)}% of limit`}
        bar={Math.min(1, load)}
        barTone={load >= 1 ? 'alarm' : load >= 0.8 ? 'warn' : 'ok'}
      />
      <p className="px-1 text-[11.5px] leading-relaxed text-dim">Simulation estimates from the agent model (same seed as the baseline). Not field-validated.</p>
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

const VIEW_PAGES: Array<Array<{ key: string; preset: Exclude<CameraPreset, 'free'>; label: string }>> = [
  [
    { key: 'thumb-aerial', preset: 'aerial', label: 'Aerial View' },
    { key: 'thumb-underwater', preset: 'underwater', label: 'Underwater Curtain' },
  ],
  [
    { key: 'thumb-intake', preset: 'intake', label: 'Intake Screens' },
    { key: 'thumb-throat', preset: 'throat', label: 'Recovery Throat' },
  ],
];

function Thumb({ k, preset, label, compact }: { k: string; preset: Exclude<CameraPreset, 'free'>; label: string; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const camera = useApp((s) => s.ui.camera);
  const setCamera = useApp((s) => s.setCamera);
  const setUI = useApp((s) => s.setUI);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    getScene().registerThumbnail(k, c, preset);
    return () => getScene().unregisterThumbnail(k);
  }, [k, preset]);
  const active = camera === preset;
  return (
    <button
      type="button"
      onClick={() => {
        setUI({ compare: false });
        setCamera(preset);
      }}
      className={cn(
        'group relative min-h-0 overflow-hidden rounded-xl border bg-[#0a1a24] transition-all duration-200',
        compact && 'aspect-video',
        active ? 'border-cyan/80 shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_0_18px_rgba(34,211,238,0.25)]' : 'border-line-strong hover:border-cyan/45',
      )}
      title={`Switch the 3D camera to ${label}`}
    >
      <canvas ref={ref} width={320} height={180} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pt-5 pb-1.5 text-[12px] font-medium text-white',
        )}
      >
        <Camera size={13} /> {label}
      </div>
    </button>
  );
}

export function CameraViewsCard({ compact }: { compact?: boolean }) {
  const [page, setPage] = useState(0);
  const views = VIEW_PAGES[page];
  return (
    <Panel
      dense
      title="Camera Views"
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="h-2 w-2 animate-pulse-soft rounded-full bg-green" /> Live
          </span>
          <div className="flex items-center">
            <button type="button" className="rounded-md p-1 text-muted hover:text-white disabled:opacity-30" disabled={page === 0} onClick={() => setPage(0)} title="Previous views">
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:text-white disabled:opacity-30"
              disabled={page === VIEW_PAGES.length - 1}
              onClick={() => setPage(1)}
              title="More views"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      }
      bodyClassName="grid grid-cols-2 gap-2"
    >
      {views.map((v) => (
        <Thumb key={v.key} k={v.key} preset={v.preset} label={v.label} compact={compact} />
      ))}
    </Panel>
  );
}
