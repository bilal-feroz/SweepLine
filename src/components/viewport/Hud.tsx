import {
  ArrowUp,
  Crosshair,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RotateCcw,
  Split,
  Wind,
  Workflow,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { compassLabel } from '../../config/site';
import { PHASE_LABELS } from '../../simulation/SimController';
import { CAMERA_PRESETS, type CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss, pct } from '../../utils/format';
import { IconButton } from '../ui/Controls';

/** Current direction & speed card with a compass that follows the camera heading. */
export function CurrentCard() {
  const p = useApp((s) => s.snap?.params);
  const heading = useApp((s) => s.ui.cameraHeading);
  if (!p) return null;
  const rel = p.currentBearing - heading;
  return (
    <div className="glass pointer-events-auto flex items-center gap-3 px-3 py-2">
      <div className="relative h-9 w-9 shrink-0 rounded-full border border-line-strong bg-base/50">
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `rotate(${rel}deg)` }}>
          <ArrowUp size={18} className="text-cyan" strokeWidth={2.4} />
        </div>
        <div className="absolute inset-0" style={{ transform: `rotate(${-heading}deg)` }}>
          <span className="absolute top-[-1px] left-1/2 -translate-x-1/2 text-[8px] font-bold text-red">N</span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-[10.5px] text-muted">Current Direction &amp; Speed</div>
        <div className="num text-[17px] text-ink">
          {p.currentSpeed.toFixed(2)}
          <span className="ml-1 text-[11px] text-ink-2">m/s</span>
          <span className="ml-2 text-[11px] text-muted">
            {compassLabel(p.currentBearing)} {p.currentBearing.toFixed(0)}°
          </span>
        </div>
      </div>
    </div>
  );
}

const SHORT_PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: 'top', label: 'Top View' },
  { key: 'aerial', label: 'Perspective' },
  { key: 'underwater', label: 'Underwater' },
];

/** Camera preset switcher and viewport tools. */
export function ViewportToolbar({ full }: { full?: boolean }) {
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const setCamera = useApp((s) => s.setCamera);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const presets = full ? CAMERA_PRESETS : SHORT_PRESETS;
  const toggleFs = () => {
    const el = document.querySelector('[data-viewport]') as HTMLElement | null;
    if (!document.fullscreenElement && el) void el.requestFullscreen();
    else void document.exitFullscreen();
  };
  return (
    <div className={cn('pointer-events-auto flex gap-1.5', full ? 'flex-col items-end' : 'items-center')}>
      <div className="glass flex items-center gap-0.5 p-[3px]">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setCamera(p.key)}
            className={cn(
              'h-[26px] rounded-md px-2.5 text-[12px] transition-colors duration-150',
              ui.camera === p.key && !ui.compare ? 'bg-cyan/20 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.5)]' : 'text-ink-2 hover:text-white',
            )}
          >
            {p.label}
          </button>
        ))}
        {ui.camera === 'free' && <span className="px-2 text-[11px] text-muted">Free camera</span>}
      </div>
      <div className="flex items-center gap-1.5">
      <IconButton title={ui.flowView ? 'Flow View on — show realistic ocean' : 'Flow View — show velocity streamlines'} active={ui.flowView} onClick={() => setUI({ flowView: !ui.flowView })}>
        <Wind size={15} />
      </IconButton>
      {full && (
        <IconButton title={ui.compare ? 'Exit compare mode' : 'Compare Baseline vs SweepLine (same seed)'} active={ui.compare} onClick={() => setUI({ compare: !ui.compare })}>
          <Split size={15} />
        </IconButton>
      )}
      <IconButton title={ui.labels ? 'Hide labels' : 'Show labels'} active={ui.labels} onClick={() => setUI({ labels: !ui.labels })}>
        {ui.labels ? <Eye size={15} /> : <EyeOff size={15} />}
      </IconButton>
      <IconButton title="Reset view" onClick={() => getScene().resetView()}>
        <RotateCcw size={15} />
      </IconButton>
      <IconButton title={fs ? 'Exit full screen' : 'Full screen'} onClick={toggleFs}>
        {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </IconButton>
      </div>
    </div>
  );
}

/** Split-view headers and live metrics for compare mode (values from both simulations). */
export function CompareOverlay() {
  const snap = useApp((s) => s.snap);
  const compare = useApp((s) => s.ui.compare);
  if (!compare || !snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  const reduction = b.intakeContactPct && s.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-cyan/0 via-cyan/50 to-cyan/0" />
      <div className="absolute top-3 left-3">
        <span className="glass block px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-ink-2">BASELINE · NO SWEEPLINE</span>
      </div>
      <div className="absolute top-[96px] left-[calc(50%+12px)] flex flex-col items-start gap-1">
        <span className="glass block border-cyan/40 px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-cyan">SWEEPLINE · {snap.curtain.angle}° LAYOUT</span>
        <span className="tag !border-line-strong !bg-base/70">Seed {snap.params.seed} · same bloom</span>
      </div>
      <div className="absolute right-[calc(50%+12px)] bottom-3 left-3 grid grid-cols-3 gap-2">
        <CompareStat label="Intake contact" value={pct(b.intakeContactPct)} sub={`n = ${b.resolved}`} tone="alarm" />
        <CompareStat label="Screen loading" value={b.screenLoad} sub={`${b.intakeRatePerMin.toFixed(1)} / min`} tone={b.screenLoad === 'HIGH' ? 'alarm' : b.screenLoad === 'MEDIUM' ? 'warn' : 'ok'} />
        <CompareStat label="Intake contacts" value={String(b.intakeContacts)} sub="cumulative" tone="muted" />
      </div>
      <div className="absolute right-3 bottom-3 left-[calc(50%+12px)] grid grid-cols-3 gap-2">
        <CompareStat label="Intake contact" value={pct(s.intakeContactPct)} sub={reduction !== null ? `${pct(-reduction)} vs baseline` : `n = ${s.resolved}`} tone="ok" />
        <CompareStat label="Diversion" value={pct(s.diversionEfficiency)} sub={`${s.diverted} diverted`} tone="info" />
        <CompareStat label="Under-skirt" value={pct(s.underSkirtPct)} sub={`${s.underSkirt} escapes`} tone="warn" />
      </div>
      <div className="absolute bottom-[76px] left-1/2 -translate-x-1/2">
        <span className="tag !bg-base/80">Simulation estimate</span>
      </div>
    </div>
  );
}

function CompareStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'ok' | 'info' | 'warn' | 'alarm' | 'muted' }) {
  const color = tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : tone === 'ok' ? 'text-teal' : tone === 'info' ? 'text-cyan' : 'text-ink';
  return (
    <div className="glass px-3 py-2">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={cn('num text-[19px] leading-tight', color)}>{value}</div>
      <div className="num text-[10.5px] text-dim">{sub}</div>
    </div>
  );
}

/** Professional SafeOpen / transfer-fault banner (amber/red used sparingly). */
export function SafetyBanner() {
  const snap = useApp((s) => s.snap);
  if (!snap) return null;
  const so = snap.safeOpen;
  const tr = snap.transfer;
  const active = so.phase !== 'IDLE' && so.phase !== 'COMPLETE';
  if (active) {
    return (
      <div className="glass pointer-events-auto flex animate-fade-in items-center gap-3 border-red/45 px-3.5 py-2 shadow-[0_0_30px_rgba(248,113,113,0.15)]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-red/60" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-red" />
        </span>
        <div className="leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-red">SAFEOPEN INITIATED</div>
          <div className="text-[12px] text-ink">{PHASE_LABELS[so.phase]}</div>
        </div>
        <div className="ml-2 border-l border-line-strong pl-3 leading-tight">
          <div className="text-[10.5px] text-muted">Curtain reefed</div>
          <div className="num text-[13px] text-amber">{snap.curtain.reefedPct.toFixed(0)}%</div>
        </div>
        <div className="leading-tight">
          <div className="text-[10.5px] text-muted">Elapsed</div>
          <div className="num text-[13px] text-ink">{mmss(so.elapsed)}</div>
        </div>
      </div>
    );
  }
  if (so.phase === 'COMPLETE') {
    return (
      <div className="glass pointer-events-auto flex animate-fade-in items-center gap-3 border-teal/40 px-3.5 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-teal" />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-teal">EXISTING INTAKE PROTECTION RESTORED</div>
          <div className="text-[12px] text-ink-2">SweepLine reefed upstream-first · Layer 3 screens unchanged</div>
        </div>
      </div>
    );
  }
  if (tr.primary === 'FAULT') {
    const ok = tr.standby === 'ONLINE';
    return (
      <div className={cn('glass pointer-events-auto flex animate-fade-in items-center gap-3 px-3.5 py-2', ok ? 'border-amber/45' : 'border-red/45')}>
        <span className={cn('h-2.5 w-2.5 rounded-full', ok ? 'bg-amber' : 'animate-pulse-soft bg-red')} />
        <div className="leading-tight">
          <div className={cn('text-[11px] font-semibold tracking-[0.14em]', ok ? 'text-amber' : 'text-red')}>TRANSFER FAILURE DETECTED</div>
          <div className="text-[12px] text-ink">
            Primary: <span className="text-red">FAULT</span> · Standby:{' '}
            <span className={tr.standby === 'ONLINE' ? 'text-teal' : tr.standby === 'ACTIVATING' ? 'text-amber' : 'text-red'}>{tr.standby}</span>
          </div>
        </div>
      </div>
    );
  }
  if (snap.status.code === 'OUTSIDE_ENVELOPE') {
    return (
      <div className="glass pointer-events-auto flex animate-fade-in items-center gap-3 border-red/45 px-3.5 py-2">
        <span className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-red" />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-red">OUTSIDE VALIDATED OPERATING ENVELOPE</div>
          <div className="text-[12px] text-ink">{snap.envelope.recommendation === 'DO NOT DEPLOY' ? 'DEPLOYMENT NOT RECOMMENDED' : snap.envelope.recommendation}</div>
        </div>
      </div>
    );
  }
  return null;
}

/** Underwater HUD: depth readout and under-skirt escape counter (+1 pulse). */
export function UnderwaterHud() {
  const underwater = useApp((s) => s.ui.underwater);
  const depth = useApp((s) => s.ui.cameraDepth);
  const under = useApp((s) => s.snap?.sweepline.underSkirt ?? 0);
  const underPct = useApp((s) => s.snap?.sweepline.underSkirtPct ?? null);
  const skirt = useApp((s) => s.snap?.curtain.skirtActual ?? 0);
  const displayed = useApp((s) => s.ui.displayed);
  const compare = useApp((s) => s.ui.compare);
  const [flash, setFlash] = useState<{ n: number; key: number } | null>(null);
  const [prev, setPrev] = useState(under);
  if (under !== prev) {
    if (under > prev) setFlash({ n: under - prev, key: Date.now() });
    setPrev(under);
  }
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);
  if (!underwater) return null;
  return (
    <>
      <div className="sl-vignette" />
      <div className="pointer-events-none absolute bottom-14 left-4 flex flex-col gap-2">
        <div className="glass px-3 py-2">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.14em] text-cyan">
            <Crosshair size={12} /> UNDERWATER · {depth.toFixed(1)} m
          </div>
          {displayed === 'sweepline' && !compare && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[11.5px]">
              <span className="text-muted">Skirt depth</span>
              <span className="num text-ink">{skirt.toFixed(1)} m</span>
              <span className="text-muted">Under-skirt escapes</span>
              <span className="num text-amber">
                {under} <span className="text-dim">({pct(underPct)})</span>
              </span>
            </div>
          )}
        </div>
        {flash && displayed === 'sweepline' && (
          <div key={flash.key} className="glass w-fit animate-fade-in border-red/50 px-3 py-1.5 text-[12px] font-semibold text-red">
            UNDER-SKIRT ESCAPE +{flash.n}
          </div>
        )}
      </div>
    </>
  );
}

/** Small legend for Flow View state colours. */
export function FlowLegend() {
  const flow = useApp((s) => s.ui.flowView);
  if (!flow) return null;
  const items: Array<[string, string]> = [
    ['#bfdbfe', 'Approaching'],
    ['#26d9f2', 'Guided'],
    ['#ffb84a', 'Throat queue'],
    ['#4df29a', 'Released'],
    ['#ff5c4d', 'Under-skirt / contact'],
  ];
  return (
    <div className="glass pointer-events-auto px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-cyan">
        <Workflow size={11} /> FLOW VIEW
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(([c, l]) => (
          <div key={l} className="flex items-center gap-2 text-[11px] text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {l}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-2">
          <span className="h-[2px] w-4 bg-gradient-to-r from-cyan/30 to-white" /> Current streamlines
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-2">
          <span className="h-2 w-3 rounded-sm bg-red/40" /> Modelled intake capture zone
        </div>
      </div>
    </div>
  );
}

/** Footer notes inside the viewport. */
export function ViewportFooter() {
  const compare = useApp((s) => s.ui.compare);
  if (compare) return null;
  return (
    <div className="pointer-events-none absolute right-3 bottom-2 text-right text-[10px] leading-tight text-ink-2/60">
      Reference coastal intake geometry — schematic, not ENEC facility data.
      <br />
      Agent-based engineering simulation — not validated field performance. Agents enlarged with distance for legibility.
    </div>
  );
}

/** Pre-roll / initialisation overlay. */
export function LoadingOverlay() {
  const loading = useApp((s) => s.loading);
  if (!loading.active) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-base/70 backdrop-blur-sm">
      <div className="glass w-[380px] px-5 py-4">
        <div className="eyebrow">SweepLine digital twin</div>
        <div className="mt-1 text-[14px] text-ink">{loading.label || 'Initialising'}</div>
        <div className="mt-3 h-[4px] overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-teal transition-[width] duration-200" style={{ width: `${loading.progress * 100}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-muted">Same seed for Baseline and SweepLine — identical bloom in both worlds.</div>
      </div>
    </div>
  );
}
