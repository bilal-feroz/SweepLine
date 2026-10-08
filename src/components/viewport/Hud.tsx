import { ArrowUp, ChevronDown, Crosshair, Eye, EyeOff, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Split, Workflow } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { compassLabel } from '../../config/site';
import { PHASE_LABELS } from '../../simulation/SimController';
import { CAMERA_PRESETS, type CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss, pct } from '../../utils/format';
import { useOutsideClose } from '../layout/TopBar';

/** Current direction & speed card with a compass that follows the camera heading. */
export function CurrentCard() {
  const p = useApp((s) => s.snap?.params);
  const heading = useApp((s) => s.ui.cameraHeading);
  if (!p) return null;
  const rel = p.currentBearing - heading;
  return (
    <div data-hud className="glass pointer-events-auto flex items-center gap-2.5 !rounded-xl py-1.5 pr-3.5 pl-1.5" title="Current speed and direction (simulation input)">
      <div className="relative h-8 w-8 shrink-0 rounded-full border border-cyan/30 bg-base/60">
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `rotate(${rel}deg)` }}>
          <ArrowUp size={15} className="text-cyan" strokeWidth={2.4} />
        </div>
        <div className="absolute inset-0" style={{ transform: `rotate(${-heading}deg)` }}>
          <span className="absolute top-[-3px] left-1/2 -translate-x-1/2 text-[8px] font-bold text-red">N</span>
        </div>
      </div>
      <div className="leading-none">
        <div className="text-[10.5px] text-muted">Current</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="num text-[16px] font-medium text-white">{p.currentSpeed.toFixed(2)}</span>
          <span className="text-[11px] text-ink-2">m/s</span>
          <span className="num ml-1.5 text-[12px] text-ink">
            {compassLabel(p.currentBearing)} {p.currentBearing.toFixed(0)}°
          </span>
        </div>
      </div>
    </div>
  );
}

const OVERVIEW_PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: 'release', label: 'Release Point' },
  { key: 'top', label: 'Top View' },
  { key: 'aerial', label: 'Perspective' },
  { key: 'underwater', label: 'Underwater' },
];

const MAIN_PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: 'aerial', label: 'Perspective' },
  { key: 'top', label: 'Top' },
  { key: 'underwater', label: 'Underwater' },
  { key: 'curtain', label: 'Curtain' },
];

const MORE_PRESETS = CAMERA_PRESETS.filter((p) => !MAIN_PRESETS.some((m) => m.key === p.key));

function ToolIcon({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors duration-150',
        active ? 'bg-cyan/20 text-cyan shadow-[inset_0_0_0_1px_rgba(34,211,238,0.55)]' : 'text-ink-2 hover:bg-white/5 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/** Camera preset switcher and viewport tools. */
export function ViewportToolbar({ full }: { full?: boolean }) {
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const setCamera = useApp((s) => s.setCamera);
  const [fs, setFs] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useOutsideClose(moreOpen, () => setMoreOpen(false));
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const presets = full ? MAIN_PRESETS : OVERVIEW_PRESETS;
  const toggleFs = () => {
    const el = document.querySelector('[data-viewport]') as HTMLElement | null;
    if (!document.fullscreenElement && el) void el.requestFullscreen();
    else void document.exitFullscreen();
  };
  const moreActive = MORE_PRESETS.find((p) => p.key === ui.camera);
  const segBtn = (active: boolean) =>
    cn(
      'h-[30px] rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors duration-150',
      active ? 'bg-[linear-gradient(180deg,#22c6e0,#129fb8)] font-semibold text-[#03121a] shadow-[0_0_12px_rgba(34,211,238,0.3)]' : 'text-ink-2 hover:text-white',
    );
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <div data-hud className="glass flex items-center gap-0.5 !rounded-xl p-[3px]">
        {presets.map((p) => (
          <button key={p.key} type="button" onClick={() => setCamera(p.key)} className={segBtn(ui.camera === p.key && !ui.compare)}>
            {p.label}
          </button>
        ))}
        {full && (
          <div className="relative" ref={moreRef}>
            <button type="button" onClick={() => setMoreOpen((o) => !o)} className={cn(segBtn(!!moreActive && !ui.compare), 'flex items-center gap-1 !px-3')}>
              {moreActive ? moreActive.label : 'More'} <ChevronDown size={13} />
            </button>
            {moreOpen && (
              <div className="glass absolute top-[38px] right-0 z-50 w-[170px] animate-fade-in p-1 shadow-2xl">
                {MORE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setCamera(p.key);
                      setMoreOpen(false);
                    }}
                    className={cn('flex w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-panel-3', ui.camera === p.key ? 'text-cyan' : 'text-ink-2')}
                  >
                    {p.label} camera
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div data-hud className="glass flex items-center gap-0.5 !rounded-xl p-[3px]">
        <ToolIcon title={ui.flowView ? 'Flow View on — show realistic ocean' : 'Flow View — show velocity streamlines'} active={ui.flowView} onClick={() => setUI({ flowView: !ui.flowView })}>
          <SlidersHorizontal size={15} />
        </ToolIcon>
        {full && (
          <>
            <ToolIcon title={ui.compare ? 'Exit compare mode' : 'Compare Baseline vs SweepLine (same seed)'} active={ui.compare} onClick={() => setUI({ compare: !ui.compare })}>
              <Split size={15} />
            </ToolIcon>
            <ToolIcon title={ui.labels ? 'Hide labels' : 'Show labels'} active={!ui.labels} onClick={() => setUI({ labels: !ui.labels })}>
              {ui.labels ? <Eye size={15} /> : <EyeOff size={15} />}
            </ToolIcon>
            <ToolIcon title="Reset view" onClick={() => getScene().resetView()}>
              <RotateCcw size={15} />
            </ToolIcon>
          </>
        )}
        <ToolIcon title={fs ? 'Exit full screen' : 'Full screen'} onClick={toggleFs}>
          {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </ToolIcon>
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
        <span data-hud className="glass block px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-ink-2">BASELINE · NO SWEEPLINE</span>
      </div>
      <div data-hud className="absolute top-[52px] left-[calc(50%+12px)] flex flex-col items-start gap-1">
        <span className="glass block border-cyan/40 px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-cyan">SWEEPLINE · {snap.curtain.angle}° LAYOUT</span>
        <span className="tag !border-line-strong !bg-base/70">Seed {snap.params.seed} · same bloom</span>
      </div>
      <div data-hud className="absolute right-[calc(50%+12px)] bottom-3 left-3 grid grid-cols-3 gap-2">
        <CompareStat label="Intake contact" value={pct(b.intakeContactPct)} sub={`n = ${b.resolved}`} tone="alarm" />
        <CompareStat label="Screen loading" value={b.screenLoad} sub={`${b.intakeRatePerMin.toFixed(1)} / min`} tone={b.screenLoad === 'HIGH' ? 'alarm' : b.screenLoad === 'MEDIUM' ? 'warn' : 'ok'} />
        <CompareStat label="Intake contacts" value={String(b.intakeContacts)} sub="cumulative" tone="muted" />
      </div>
      <div data-hud className="absolute right-3 bottom-3 left-[calc(50%+12px)] grid grid-cols-3 gap-2">
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
      <div data-hud className="glass pointer-events-auto flex animate-fade-in items-center gap-2.5 border-red/45 px-3 py-1.5 shadow-[0_0_24px_rgba(248,113,113,0.14)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-red/60" />
          <span className="relative h-2 w-2 rounded-full bg-red" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-red">SAFEOPEN</div>
          <div className="text-[11.5px] text-ink">{PHASE_LABELS[so.phase]}</div>
        </div>
        <div className="ml-1 border-l border-line-strong pl-2.5 leading-tight">
          <div className="text-[10px] text-muted">Reefed</div>
          <div className="num text-[12px] text-amber">{snap.curtain.reefedPct.toFixed(0)}%</div>
        </div>
        <div className="leading-tight">
          <div className="text-[10px] text-muted">Elapsed</div>
          <div className="num text-[12px] text-ink">{mmss(so.elapsed)}</div>
        </div>
      </div>
    );
  }
  if (so.phase === 'COMPLETE') {
    return (
      <div data-hud className="glass pointer-events-auto flex animate-fade-in items-center gap-2.5 border-teal/40 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-teal" />
        <div className="leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-teal">INTAKE PROTECTION RESTORED</div>
          <div className="text-[11.5px] text-ink-2">Reefed upstream-first · existing screens unchanged</div>
        </div>
      </div>
    );
  }
  if (tr.primary === 'FAULT') {
    const ok = tr.standby === 'ONLINE';
    return (
      <div data-hud className={cn('glass pointer-events-auto flex animate-fade-in items-center gap-2.5 px-3 py-1.5', ok ? 'border-amber/45' : 'border-red/45')}>
        <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-amber' : 'animate-pulse-soft bg-red')} />
        <div className="leading-tight">
          <div className={cn('text-[10px] font-semibold tracking-[0.14em]', ok ? 'text-amber' : 'text-red')}>TRANSFER FAILURE</div>
          <div className="text-[11.5px] text-ink">
            Primary: <span className="text-red">FAULT</span> · Standby:{' '}
            <span className={tr.standby === 'ONLINE' ? 'text-teal' : tr.standby === 'ACTIVATING' ? 'text-amber' : 'text-red'}>{tr.standby}</span>
          </div>
        </div>
      </div>
    );
  }
  if (snap.status.code === 'OUTSIDE_ENVELOPE') {
    return (
      <div data-hud className="glass pointer-events-auto flex animate-fade-in items-center gap-2.5 border-red/45 px-3 py-1.5">
        <span className="h-2 w-2 animate-pulse-soft rounded-full bg-red" />
        <div className="leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-red">OUTSIDE VALIDATED OPERATING ENVELOPE</div>
          <div className="text-[11.5px] text-ink">{snap.envelope.recommendation === 'DO NOT DEPLOY' ? 'DEPLOYMENT NOT RECOMMENDED' : snap.envelope.recommendation}</div>
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
      <div className="pointer-events-none absolute bottom-[74px] left-4 flex flex-col gap-2">
        <div data-hud className="glass px-3 py-2">
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
    <div data-hud className="glass pointer-events-auto px-3 py-2">
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

/** Footer note inside the viewport. */
export function ViewportFooter() {
  const compare = useApp((s) => s.ui.compare);
  if (compare) return null;
  return (
    <div
      data-hud
      className="pointer-events-auto absolute right-3 bottom-2.5 text-right text-[10.5px] text-ink-2/55"
      title="Reference coastal intake geometry is schematic and not ENEC facility data. Agent-based engineering simulation — not validated field performance. Agents are drawn enlarged at distance for legibility."
    >
      Schematic reference geometry · simulation estimate · agents enlarged for legibility
    </div>
  );
}

/** Pre-roll / initialisation overlay (the opening intro shows its own progress instead). */
export function LoadingOverlay() {
  const loading = useApp((s) => s.loading);
  const intro = useApp((s) => s.intro);
  if (!loading.active || intro) return null;
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
