import {
  AlertTriangle,
  Anchor,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  FlaskConical,
  Layers,
  Lock,
  PowerOff,
  RefreshCcw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { ASSUMPTIONS } from '../../config/assumptions';
import { OPERATING_ENVELOPE } from '../../config/operatingEnvelope';
import { controller } from '../../simulation/SimController';
import { ANCHOR_ANGLES, DEFAULT_PARAMS, type AnchorAngle, type FailureKey, type ModuleStatus } from '../../simulation/types';
import { clockTime, cn, mmss } from '../../utils/format';
import { useOutsideClose } from '../layout/TopBar';
import { EnvelopeBadge } from '../layout/PageHeader';
import { Segmented, Slider, Toggle } from '../ui/Controls';
import { Icon } from '../ui/icons';
import { IconTile, Panel, Pill, StatusDot } from '../ui/Panel';
import { TimelineTrack } from './OverviewPanels';

// ---------------------------------------------------------------- operations

const SO_STEPS = [
  { phase: 'INITIATED', label: 'Stop accepting new bloom traffic' },
  { phase: 'UPSTREAM_REEF', label: 'Reef upstream section first' },
  { phase: 'CLEARING', label: 'Keep transfer running, clear traffic' },
  { phase: 'PROGRESSIVE_REEF', label: 'Progressively reef remaining curtain' },
  { phase: 'THROAT_CLEAR', label: 'Clear recovery throat' },
  { phase: 'COMPLETE', label: 'Baseline intake protection restored' },
] as const;

export function SafeOpenChecklist() {
  const phase = useApp((s) => s.snap?.safeOpen.phase ?? 'IDLE');
  const idx = SO_STEPS.findIndex((s) => s.phase === phase);
  const done = phase === 'COMPLETE' ? SO_STEPS.length : Math.max(0, idx);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink">SafeOpen Sequence</span>
        <span className={cn('text-[12.5px]', phase === 'IDLE' ? 'text-muted' : phase === 'COMPLETE' ? 'text-teal' : 'text-red')}>
          {phase === 'IDLE' ? 'Standing by' : `${done}/${SO_STEPS.length} complete`}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {SO_STEPS.map((s, i) => {
          const isDone = phase === 'COMPLETE' || (idx > i && phase !== 'IDLE');
          const cur = idx === i && phase !== 'COMPLETE';
          return (
            <li key={s.phase} className="flex items-center gap-2.5 text-[13px]">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  isDone ? 'border-teal bg-teal text-[#03121a]' : cur ? 'border-red bg-red/20 text-red' : 'border-[rgba(150,200,220,0.3)] text-transparent',
                )}
              >
                {isDone ? <Check size={12} strokeWidth={3} /> : cur ? <span className="h-1.5 w-1.5 rounded-full bg-red" /> : null}
              </span>
              <span className={cn(isDone ? 'text-ink-2' : cur ? 'font-medium text-white' : 'text-muted')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function OperationsCard() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const mode = snap.curtain.mode;
  const so = snap.safeOpen;
  const soActive = so.phase !== 'IDLE' && so.phase !== 'COMPLETE';
  const canDeploy = mode === 'STOWED';
  const canRearm = so.phase === 'COMPLETE' || mode === 'REEFED';
  const canSafeOpen = !soActive && (mode === 'DEPLOYED' || mode === 'DEPLOYING' || mode === 'UNREEFING');
  return (
    <Panel
      title="Operations"
      icon={<ShieldCheck size={18} />}
      subtitle={`Curtain ${mode.toLowerCase()} · ${snap.params.anchorAngle}° anchor layout`}
      bodyClassName="flex flex-col gap-4"
    >
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-[14px] font-semibold text-ink">Safety Controls</span>
          <EnvelopeBadge short />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-solid !h-[42px]"
            disabled={!canDeploy && !canRearm}
            onClick={() => {
              const ok = canDeploy ? controller.deploy('manual') : controller.rearm();
              if (!ok) showToast('Rejected — outside validated operating envelope', 'alarm');
            }}
          >
            {canRearm ? <RefreshCcw size={15} /> : <Anchor size={15} />}
            {canRearm ? 'Re-arm SweepLine' : 'Deploy SweepLine'}
          </button>
          <button type="button" className="btn btn-danger !h-[42px]" disabled={!canSafeOpen} onClick={() => controller.initiateSafeOpen('Operator command')}>
            <AlertTriangle size={15} /> Initiate SafeOpen
          </button>
          {mode === 'REEFED' ? (
            <button
              type="button"
              className="btn !h-[42px]"
              disabled={soActive}
              onClick={() => controller.stowCurtain()}
              title={soActive ? 'Available once SafeOpen completes' : 'Reel the reefed curtain back onto the throat-side reel'}
            >
              <ArrowDownToLine size={15} className="rotate-180" /> Stow curtain
            </button>
          ) : (
            <button type="button" className="btn !h-[42px]" disabled={!snap.bloom.active} onClick={() => controller.endBloom()} title="Stop new arrivals; the curtain stows once traffic clears">
              <Square size={14} /> End bloom
            </button>
          )}
          <button type="button" className="btn !h-[42px]" onClick={() => void controller.restart('sequence')} title="Restart from bloom approach (same seed)">
            <RotateCcw size={15} /> Restart run
          </button>
        </div>
        {soActive && (
          <div className="mt-2.5 rounded-xl border border-red/35 bg-red/[0.07] px-3 py-2 text-[12.5px]">
            <span className="font-semibold text-red">SafeOpen</span> <span className="text-ink-2">— {so.reason}</span>
          </div>
        )}
      </div>
      <div className="border-t border-line pt-3.5">
        <SafeOpenChecklist />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- stress test

const FAULTS: Array<{ key: FailureKey; title: string; sub: string; icon: ReactNode }> = [
  { key: 'transferPrimary', title: 'Transfer failure', sub: 'Primary module fault', icon: <Zap size={18} /> },
  { key: 'extremeCurrent', title: 'Extreme current', sub: '0.78 m/s', icon: <Wind size={18} /> },
  { key: 'deepBloom', title: 'Deep bloom', sub: 'Mean depth 3.6 m', icon: <Icon name="jellyfish" size={18} /> },
  { key: 'highDensity', title: 'High density', sub: 'Bloom surge', icon: <Layers size={18} /> },
  { key: 'curtainOverload', title: 'Curtain overload', sub: 'Debris / bio-fouling', icon: <AlertTriangle size={18} /> },
  { key: 'highWaves', title: 'High wave state', sub: 'Hs 1.9 m', icon: <Waves size={18} /> },
];

export function StressTestCard() {
  const snap = useSnap();
  if (!snap) return null;
  const f = snap.failures;
  const any = Object.values(f).some(Boolean);
  return (
    <Panel
      title="Stress Test"
      icon={<FlaskConical size={18} />}
      subtitle="Inject faults to test system response"
      actions={
        any ? (
          <button type="button" className="btn !h-[30px] !px-2.5 !text-[12px]" onClick={() => controller.clearAllFailures()} title="Clear all injected faults">
            <RefreshCcw size={12} /> Clear
          </button>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        {FAULTS.map((x) => {
          const active = f[x.key];
          return (
            <button
              key={x.key}
              type="button"
              aria-pressed={active}
              onClick={() => (active ? controller.clearFailure(x.key) : controller.injectFailure(x.key))}
              className={cn(
                'card-inner flex flex-col items-start gap-2.5 px-3 pt-3 pb-2.5 text-left transition-colors duration-150',
                active ? '!border-red/50 !bg-red/[0.1]' : 'hover:!border-cyan/30 hover:!bg-[rgba(20,40,56,0.6)]',
              )}
              title={active ? 'Active — click to clear this fault' : `Inject: ${x.title.toLowerCase()} (${x.sub})`}
            >
              <span className="flex w-full items-center justify-between">
                <IconTile size={32} tone={active ? 'red' : 'cyan'}>
                  {x.icon}
                </IconTile>
                {active && (
                  <span className="pill !h-[20px] !px-2 !text-[10px]" data-tone="red">
                    ACTIVE
                  </span>
                )}
              </span>
              <span className="w-full min-w-0">
                <span className={cn('block truncate text-[13.5px] leading-tight font-medium', active ? 'text-red' : 'text-ink')}>{x.title}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">{x.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      {f.transferPrimary && (
        <button
          type="button"
          aria-pressed={f.transferStandby}
          onClick={() => (f.transferStandby ? controller.clearFailure('transferStandby') : controller.injectFailure('transferStandby'))}
          className={cn(
            'card-inner flex animate-fade-in items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
            f.transferStandby ? '!border-red/50 !bg-red/[0.1]' : '!border-amber/40 hover:!bg-amber/[0.08]',
          )}
        >
          <IconTile size={32} tone={f.transferStandby ? 'red' : 'amber'}>
            <PowerOff size={16} />
          </IconTile>
          <span>
            <span className={cn('block text-[13px] font-medium', f.transferStandby ? 'text-red' : 'text-amber')}>
              {f.transferStandby ? 'Standby failed — active' : 'Fail standby transfer too'}
            </span>
            <span className="block text-[11.5px] text-muted">Standby path: {snap.transfer.standby}</span>
          </span>
        </button>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- event log + timeline

const LEVEL_DOT: Record<string, string> = { info: 'bg-cyan', ok: 'bg-teal', warn: 'bg-amber', alarm: 'bg-red' };
const LEVEL_TEXT: Record<string, string> = { info: 'text-ink-2', ok: 'text-ink-2', warn: 'text-amber', alarm: 'text-red' };

export function EventLogCard({ max = 80 }: { max?: number }) {
  const snap = useSnap();
  const [mode, setMode] = useState<'clock' | 'run'>('clock');
  const [open, setOpen] = useState(false);
  const ddRef = useOutsideClose(open, () => setOpen(false));
  const listRef = useRef<HTMLDivElement>(null);
  const events = snap ? snap.events.slice(-max).reverse() : [];
  const lastId = events.length ? events[0].id : 0;
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [lastId]);
  if (!snap) return null;
  const start = snap.clockMs - snap.simTime * 1000;
  return (
    <Panel
      dense
      title="Event Log"
      icon={<FileText size={16} />}
      actions={
        <div className="relative" ref={ddRef}>
          <button type="button" onClick={() => setOpen((o) => !o)} className="pill !h-[26px] !gap-1.5 !px-2.5 !text-[10.5px]" data-tone="muted">
            {mode === 'clock' ? 'SIM CLOCK' : 'RUN TIME'} <ChevronDown size={13} />
          </button>
          {open && (
            <div className="glass absolute top-[32px] right-0 z-50 w-[170px] animate-fade-in p-1 shadow-2xl">
              {(
                [
                  ['clock', 'Simulation clock'],
                  ['run', 'Run time (mm:ss)'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setMode(k);
                    setOpen(false);
                  }}
                  className={cn('flex w-full rounded-md px-3 py-2 text-left text-[12.5px] hover:bg-panel-3', mode === k ? 'text-cyan' : 'text-ink-2')}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      }
      bodyClassName="min-h-0"
    >
      <div ref={listRef} className="h-full overflow-y-auto pr-1">
        {events.length === 0 && <div className="text-[12.5px] text-muted">No events yet.</div>}
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5 py-[3px] text-[12.5px] leading-snug">
            <span className="num w-[58px] shrink-0 text-[11.5px] text-muted">{mode === 'clock' ? clockTime(start + e.t * 1000) : mmss(e.t)}</span>
            <span className={cn('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[e.level])} />
            <span className={LEVEL_TEXT[e.level]}>{e.message}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function TimelineWideCard() {
  const snap = useSnap();
  if (!snap) return null;
  const order = snap.timeline.map((s) => s.key);
  const phase = order.indexOf(snap.stage) + 1;
  return (
    <Panel
      dense
      title="Simulation Timeline"
      icon={<Clock3 size={16} />}
      actions={
        <span className="pill !h-[26px] !text-[10.5px]" data-tone="muted">
          Phase {phase} of {order.length} · {mmss(snap.simTime)}
        </span>
      }
      bodyClassName="flex flex-col justify-end"
    >
      <TimelineTrack size="sm" />
    </Panel>
  );
}

// ---------------------------------------------------------------- SweepLine Active

function JetStat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="card-inner px-2 py-2">
      <div className="num text-[16px] leading-tight text-cyan">
        {value}
        <span className="ml-0.5 text-[11px] text-ink-2">{unit}</span>
      </div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

/** The core idea: a curtain that pops up from the seabed and makes its own current with built-in water jets. */
export function ActiveFlowCard() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const D = ASSUMPTIONS.deploy;
  const popUpMin = (D.popUpDelay + (c.length + ASSUMPTIONS.curtain.skirtDropLag + 3) / D.popUpSpeed) / 60;
  const running = c.jetOutput > 0.01;
  return (
    <Panel
      title="SweepLine Active"
      icon={<Waves size={18} />}
      subtitle="A pop-up curtain that makes its own current"
      actions={
        <Pill tone={p.activeFlow ? 'cyan' : 'muted'} dot={p.activeFlow && running} className="!h-[22px] !px-2 !text-[10px]">
          {p.activeFlow ? (running ? 'JETS ON' : 'READY') : 'PASSIVE'}
        </Pill>
      }
      bodyClassName="flex flex-col gap-3.5"
    >
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <span className="text-ink-2">Deployment</span>
          <span className="text-[11.5px] text-muted">applies to the next deployment</span>
        </div>
        <Segmented
          value={p.deployMode}
          onChange={(v) => controller.setParams({ deployMode: v })}
          options={[
            { value: 'popup', label: 'Pop-up (seabed)' },
            { value: 'workboat', label: 'Workboat' },
          ]}
        />
        <p className="mt-1.5 text-[11.5px] leading-snug text-dim">
          {p.deployMode === 'popup'
            ? `Stowed on the seabed; the float line inflates from the throat end — about ${popUpMin.toFixed(1)} min after the warning, no vessel.`
            : `A vessel mobilises (~${Math.round(D.workboatMobilisation / 60)} min, assumption), then lays the curtain at ${ASSUMPTIONS.curtain.deploySpeed} m/s.`}
        </p>
      </div>
      <div className="border-t border-line pt-3">
        <Toggle
          checked={p.activeFlow}
          onChange={(v) => controller.setParams({ activeFlow: v })}
          label="Water jets (conveyor + foot)"
          hint="Conveyor along the face; foot jets lift jellyfish at the skirt edge"
        />
        <div className="mt-2">
          <Slider
            label="Jet output"
            value={p.jetLevel}
            min={0.1}
            max={1}
            step={0.05}
            display={`${Math.round(p.jetLevel * 100)}%`}
            disabled={!p.activeFlow}
            onChange={(v) => controller.setParams({ jetLevel: v })}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <JetStat value={c.jetConveyor.toFixed(2)} unit="m/s" label="at the face" />
          <JetStat value={c.jetFlowM3s.toFixed(1)} unit="m³/s" label="water" />
          <JetStat value={String(Math.round(c.jetPowerKW))} unit="kW" label="pump power" />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-dim">First estimates from wall-jet scaling — to be sized by CFD and flume tests.</p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- live controls

export function LiveControlsCard() {
  const snap = useSnap();
  const displayed = useApp((s) => s.ui.displayed);
  const setUI = useApp((s) => s.setUI);
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const p = snap.params;
  const deployed = snap.curtain.mode !== 'STOWED';
  const C = ASSUMPTIONS.curtain;
  const maxSkirt = Math.min(C.skirtDepthMax, snap.curtain.clearanceMax);
  const setAngle = (a: AnchorAngle) => {
    if (a === p.anchorAngle) return;
    if (deployed) showToast(`Angle is fixed while deployed — restarting the run on the ${a}° anchors (same seed)`, 'warn');
    void controller.selectAnchorLayout(a);
  };
  return (
    <Panel
      title="Live Controls"
      icon={<SlidersHorizontal size={18} />}
      subtitle="Every control drives the simulation"
      actions={
        <button
          type="button"
          className="btn !h-[30px] !px-2.5 !text-[12px]"
          title="Reset controls to reference values"
          onClick={() => {
            const { bloomDensity, currentSpeed, bloomMeanDepth, bloomDepthSD, skirtDepth, transferCapacity, waveHeight, currentBearing } = DEFAULT_PARAMS;
            controller.setParams({ bloomDensity, currentSpeed, bloomMeanDepth, bloomDepthSD, skirtDepth, transferCapacity, waveHeight, currentBearing });
            showToast('Controls reset to reference values', 'info');
          }}
        >
          <RotateCcw size={12} /> Reset
        </button>
      }
      bodyClassName="flex flex-col gap-3.5"
    >
      <div>
        <div className="mb-1.5 text-[13px] text-ink-2">World shown</div>
        <Segmented
          value={displayed}
          onChange={(v) => setUI({ displayed: v, compare: false })}
          options={[
            { value: 'baseline', label: 'Baseline' },
            { value: 'sweepline', label: 'SweepLine' },
          ]}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <span className="text-ink-2">Anchor layout</span>
          {deployed && (
            <span className="flex items-center gap-1 text-[11.5px] text-muted">
              <Lock size={11} /> fixed while deployed
            </span>
          )}
        </div>
        <Segmented
          value={p.anchorAngle}
          onChange={setAngle}
          options={ANCHOR_ANGLES.map((a) => ({
            value: a,
            label: `${a}°`,
            title: deployed && a !== p.anchorAngle ? `Fixed while deployed — selecting ${a}° restarts the run and redeploys` : `${a}° pre-engineered anchor layout`,
          }))}
        />
      </div>
      <Slider label="Bloom density" value={p.bloomDensity} min={0.1} max={1} step={0.01} display={`${Math.round(p.bloomDensity * 100)}%`} onChange={(v) => controller.setParams({ bloomDensity: v })} />
      <Slider
        label="Current speed"
        value={p.currentSpeed}
        min={0.05}
        max={0.9}
        step={0.01}
        display={`${p.currentSpeed.toFixed(2)} m/s`}
        tone={p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.max ? 'red' : p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.near ? 'amber' : undefined}
        marker={{ value: OPERATING_ENVELOPE.currentSpeed.max, label: 'Envelope limit' }}
        onChange={(v) => controller.setParams({ currentSpeed: v })}
      />
      <Slider
        label="Bloom depth (mean)"
        value={p.bloomMeanDepth}
        min={0.5}
        max={4.5}
        step={0.1}
        display={`${p.bloomMeanDepth.toFixed(1)} m`}
        tone={snap.bloom.p90 > p.skirtDepth ? 'amber' : undefined}
        onChange={(v) => controller.setParams({ bloomMeanDepth: v })}
      />
      <Slider
        label="Skirt depth"
        value={p.skirtDepth}
        min={C.skirtDepthMin}
        max={maxSkirt}
        step={0.5}
        display={`${p.skirtDepth.toFixed(1)} m`}
        hint={snap.curtain.skirtActual.toFixed(1) !== p.skirtDepth.toFixed(1) ? `Winches adjusting · ${snap.curtain.skirtActual.toFixed(1)} m` : undefined}
        onChange={(v) => controller.setParams({ skirtDepth: v })}
      />
      <Slider label="Transfer capacity" value={p.transferCapacity} min={0.2} max={1} step={0.01} display={`${Math.round(p.transferCapacity * 100)}%`} onChange={(v) => controller.setParams({ transferCapacity: v })} />
      <Slider
        label="Wave height (Hs)"
        value={p.waveHeight}
        min={0.1}
        max={2.5}
        step={0.05}
        display={`${p.waveHeight.toFixed(2)} m`}
        tone={p.waveHeight > OPERATING_ENVELOPE.waveHeight.max ? 'red' : p.waveHeight > OPERATING_ENVELOPE.waveHeight.near ? 'amber' : undefined}
        marker={{ value: OPERATING_ENVELOPE.waveHeight.max, label: 'Envelope limit' }}
        onChange={(v) => controller.setParams({ waveHeight: v })}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------- transfer + run settings

function moduleTone(s: ModuleStatus): 'ok' | 'warn' | 'alarm' | 'muted' {
  if (s === 'ONLINE') return 'ok';
  if (s === 'ACTIVATING') return 'warn';
  if (s === 'FAULT') return 'alarm';
  return 'muted';
}

export function TransferCard() {
  const snap = useSnap();
  if (!snap) return null;
  const tr = snap.transfer;
  const s = snap.sweepline;
  const row = (label: string, status: ModuleStatus) => {
    const t = moduleTone(status);
    return (
      <div className="flex items-center justify-between py-1 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className={cn('flex items-center gap-1.5 font-mono text-[12px]', t === 'ok' ? 'text-teal' : t === 'warn' ? 'text-amber' : t === 'alarm' ? 'text-red' : 'text-muted')}>
          <StatusDot tone={t} pulse={status === 'FAULT' || status === 'ACTIVATING'} />
          {status}
        </span>
      </div>
    );
  };
  return (
    <Panel title="Transfer System" icon={<Icon name="transfer" size={18} />} subtitle="Large-aperture low-shear module" actions={<Pill tone="muted" dot={false}>{tr.path}</Pill>}>
      {row('Primary path', tr.primary)}
      {row('Standby path', tr.standby)}
      <div className="flex items-center justify-between py-1 text-[13px]">
        <span className="text-ink-2">Passive open-flow line</span>
        <span className="font-mono text-[12px] text-muted">{Math.round(ASSUMPTIONS.transfer.passiveDrainFraction * 100)}% (assumption)</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <div>
          <div className="num text-[17px] text-cyan">{Math.round(tr.flowM3h)}</div>
          <div className="text-[11px] text-muted">m³/h capacity</div>
        </div>
        <div>
          <div className="num text-[17px] text-ink">{s.transferred}</div>
          <div className="text-[11px] text-muted">transferred</div>
        </div>
        <div>
          <div className="num text-[17px] text-teal">{s.released}</div>
          <div className="text-[11px] text-muted">released</div>
        </div>
      </div>
      <div className="mt-2 border-t border-line pt-2">
        <Toggle checked={snap.params.standbyEnabled} onChange={(v) => controller.setParams({ standbyEnabled: v })} label="Standby transfer path armed" hint="First fail-safe — activates on a primary fault" />
      </div>
    </Panel>
  );
}

export function RunSettingsCard() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  const seedRef = useRef<HTMLInputElement>(null);
  if (!snap) return null;
  const p = snap.params;
  return (
    <Panel title="Run Settings" icon={<Settings2 size={18} />} subtitle="Seed, agents and assumptions" bodyClassName="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 text-[13px] text-ink-2">Release distance (simulation assumption)</div>
        <Segmented size="sm" value={p.releaseDistance} onChange={(v) => controller.setParams({ releaseDistance: v })} options={ASSUMPTIONS.release.distanceOptions.map((d) => ({ value: d, label: `${d} m` }))} />
      </div>
      <div>
        <div className="mb-1.5 text-[13px] text-ink-2">Simulated agents</div>
        <Segmented
          size="sm"
          value={p.agentBudget}
          onChange={(v) => {
            void controller.reseed(p.seed, v);
            showToast(`Restarting with ${v} agents (same seed)`, 'info');
          }}
          options={[250, 500, 1000, 1500, 2000].map((n) => ({ value: n, label: String(n) }))}
        />
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(seedRef.current?.value);
          if (!Number.isFinite(v) || v <= 0) {
            showToast('Seed must be a positive integer', 'warn');
            return;
          }
          void controller.reseed(Math.floor(v), controller.params.agentBudget);
          showToast(`Re-seeded bloom · SEED ${Math.floor(v)}`, 'info');
        }}
      >
        <label className="flex-1">
          <span className="mb-1.5 block text-[13px] text-ink-2">Random seed</span>
          <input ref={seedRef} key={p.seed} defaultValue={p.seed} className="input" inputMode="numeric" aria-label="Random seed" />
        </label>
        <button type="submit" className="btn !h-[36px]">
          Apply
        </button>
      </form>
      <Toggle checked={p.autoDeploy} onChange={(v) => controller.setParams({ autoDeploy: v })} label="Auto-deploy after early warning" hint="Only inside the assumed operating envelope" />
    </Panel>
  );
}
