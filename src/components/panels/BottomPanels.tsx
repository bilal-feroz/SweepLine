import { Camera, RotateCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getScene } from '../../app/runtime';
import { useHistory, useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { controller, type StageKey } from '../../simulation/SimController';
import type { CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss, pct } from '../../utils/format';
import { Sparkline } from '../charts/Sparkline';
import { Panel } from '../ui/Panel';

const OVERVIEW_STAGES: Array<{ key: StageKey; label: string; sub?: string }> = [
  { key: 'bloom', label: 'Bloom', sub: 'Approach' },
  { key: 'deploy', label: 'Deploy', sub: 'System' },
  { key: 'sweep', label: 'Sweep', sub: '& Divert' },
  { key: 'transfer', label: 'Transfer', sub: 'Live' },
  { key: 'release', label: 'Safe', sub: 'Release' },
];

export function TimelineSteps({ stages, compact }: { stages: Array<{ key: StageKey; label: string; sub?: string }>; compact?: boolean }) {
  const snap = useSnap();
  if (!snap) return null;
  const at = (k: StageKey) => snap.timeline.find((s) => s.key === k)?.at ?? null;
  const order = snap.timeline.map((s) => s.key);
  const curIdx = order.indexOf(snap.stage);
  return (
    <div className="relative flex items-start justify-between">
      <div className="absolute top-[15px] right-[18px] left-[18px] h-px bg-line-strong" />
      {stages.map((s, i) => {
        const t = at(s.key);
        const reached = t !== null;
        const idx = order.indexOf(s.key);
        const current = reached && (idx === curIdx || (stages[i + 1] ? at(stages[i + 1].key) === null : true));
        return (
          <div key={s.key} className="relative z-10 flex flex-1 flex-col items-center text-center">
            <div
              className={cn(
                'flex h-[31px] w-[31px] items-center justify-center rounded-full border text-[12px] font-semibold transition-all duration-300',
                current
                  ? 'border-cyan bg-cyan text-base shadow-[0_0_0_4px_rgba(34,211,238,0.18),0_0_16px_rgba(34,211,238,0.5)]'
                  : reached
                    ? 'border-cyan/50 bg-cyan/12 text-cyan'
                    : 'border-line-strong bg-panel-2 text-muted',
              )}
            >
              {i + 1}
            </div>
            <div className={cn('mt-1.5 text-[11.5px] leading-tight', current ? 'font-semibold text-ink' : reached ? 'text-ink-2' : 'text-muted')}>
              {s.label}
              {!compact && s.sub && <div className="text-[10.5px] font-normal text-muted">{s.sub}</div>}
            </div>
            <div className="num mt-1 text-[10.5px] text-dim">{t === null ? '--:--' : mmss(t)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TimelinePanel() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const warning = snap.timeline.find((s) => s.key === 'warning')?.at ?? null;
  const recovery = snap.timeline.find((s) => s.key === 'recovery')?.at ?? null;
  return (
    <Panel
      title="Simulation Timeline"
      actions={
        <button
          type="button"
          className="btn !h-[24px] !px-2 !text-[11px]"
          title="Replay the full sequence from bloom approach with the same seed"
          onClick={() => {
            void controller.restart('sequence');
            showToast('Replaying sequence from bloom approach (same seed)', 'info');
          }}
        >
          <RotateCw size={11} /> Replay
        </button>
      }
      bodyClassName="flex flex-col justify-between gap-2"
    >
      <TimelineSteps stages={OVERVIEW_STAGES} />
      <div className="flex items-center justify-between border-t border-line pt-2 text-[10.5px] text-muted">
        <span>
          Warning <span className="num text-ink-2">{warning === null ? '--:--' : mmss(warning)}</span>
        </span>
        <span className="truncate px-2 text-ink-2">{snap.status.label}</span>
        <span>
          Recovery <span className="num text-ink-2">{recovery === null ? '--:--' : mmss(recovery)}</span>
        </span>
      </div>
    </Panel>
  );
}

function MetricCard({ title, value, tone, data, secondary, color, sub, min }: { title: string; value: string; tone: string; data: Array<number | null>; secondary?: Array<number | null>; color: string; sub?: string; min?: number }) {
  return (
    <div className="panel-flat flex min-w-0 flex-col justify-between px-3 py-2">
      <span className="truncate text-[11.5px] text-ink-2">{title}</span>
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className={cn('num shrink-0 text-[18px] leading-tight whitespace-nowrap', tone)}>{value}</span>
        {sub && <span className="min-w-0 truncate text-[10px] text-dim">{sub}</span>}
      </div>
      <Sparkline data={data} secondary={secondary} color={color} height={28} min={min} />
    </div>
  );
}

export function KeyMetricsPanel() {
  const snap = useSnap();
  const hist = useHistory(90);
  if (!snap) return null;
  const s = snap.sweepline;
  const b = snap.baseline;
  const reduction = b.intakeRatePerMin > 0.05 ? 1 - s.intakeRatePerMin / b.intakeRatePerMin : null;
  return (
    <Panel title="Key Metrics" actions={<span className="tag !text-cyan">Live</span>} bodyClassName="grid grid-cols-2 grid-rows-2 gap-2">
      <MetricCard
        title="Jellyfish at Intake"
        sub="vs baseline"
        value={reduction === null ? `${s.intakeRatePerMin.toFixed(1)}/min` : pct(-reduction)}
        tone={reduction !== null && reduction > 0.5 ? 'text-teal' : 'text-amber'}
        data={hist.map((h) => h.sRate)}
        secondary={hist.map((h) => h.bRate)}
        color="#1AA3BE"
        min={0}
      />
      <MetricCard title="Sweep Efficiency" value={pct(s.diversionEfficiency)} sub="diverted / encountered" tone="text-cyan" data={hist.map((h) => (h.efficiency === null ? null : h.efficiency * 100))} color="#22d3ee" />
      <MetricCard title="Transfer Flow" value={`${Math.round(s.transferFlowM3h * Math.min(1, s.transferUtilisation ?? 0))} m³/h`} sub="water flow" tone="text-cyan" data={hist.map((h) => h.flow)} color="#38bdf8" min={0} />
      <MetricCard
        title="Curtain Load"
        value={s.curtainLoadLabel === 'INACTIVE' ? 'Inactive' : s.curtainLoadLabel.charAt(0) + s.curtainLoadLabel.slice(1).toLowerCase()}
        tone={s.curtainLoadLabel === 'OVERLOAD' ? 'text-red' : s.curtainLoadLabel === 'HIGH' ? 'text-amber' : 'text-amber/90'}
        sub={`${(s.curtainLoad * 100).toFixed(0)}% of design`}
        data={hist.map((h) => h.load * 100)}
        color="#f5b94c"
        min={0}
      />
    </Panel>
  );
}

const THUMBS: Array<{ key: string; preset: Exclude<CameraPreset, 'free'>; label: string }> = [
  { key: 'thumb-aerial', preset: 'aerial', label: 'Aerial View' },
  { key: 'thumb-underwater', preset: 'underwater', label: 'Underwater Curtain' },
  { key: 'thumb-intake', preset: 'intake', label: 'Intake Screens' },
  { key: 'thumb-throat', preset: 'throat', label: 'Recovery Throat' },
];

function Thumb({ k, preset, label }: { k: string; preset: Exclude<CameraPreset, 'free'>; label: string }) {
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
        'group relative min-h-0 overflow-hidden rounded-lg border bg-[#0a1a24] transition-all duration-200',
        active ? 'border-cyan/70 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]' : 'border-line-strong hover:border-cyan/40',
      )}
      title={`Switch the 3D camera to ${label}`}
    >
      <canvas ref={ref} width={320} height={180} className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-2 pt-4 pb-1.5 text-[11px] font-medium text-white">
        <Camera size={11} /> {label}
      </div>
    </button>
  );
}

export function CameraViewsPanel() {
  return (
    <Panel
      title="Camera Views"
      actions={
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-green" /> Live feeds
        </span>
      }
      bodyClassName="grid grid-cols-2 grid-rows-2 gap-2"
    >
      {THUMBS.map((t) => (
        <Thumb key={t.key} k={t.key} preset={t.preset} label={t.label} />
      ))}
    </Panel>
  );
}
